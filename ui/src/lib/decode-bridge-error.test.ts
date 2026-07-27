import { describe, expect, test } from "bun:test";
import {
  BaseError,
  ContractFunctionRevertedError,
  EstimateGasExecutionError,
  InsufficientFundsError,
  UserRejectedRequestError,
  encodeErrorResult,
  zeroAddress,
  type Hex,
} from "viem";

import {
  bridgeErrorAbi,
  decodeBridgeError,
  type DecodeBridgeErrorInput,
  type DecodedBridgeErrorKind,
} from "./decode-bridge-error";

// viem's built-in `Error(string)`/`Panic(uint256)` fragments (`solidityError`/`solidityPanic`)
// are not part of viem's public package export surface, so we mirror their well-known shape
// locally to build test fixtures. `bridgeErrorAbi` never needs these — `decodeErrorResult`
// (used internally by `ContractFunctionRevertedError`) appends both automatically at decode time.
const solidityErrorAbiItem = {
  type: "error",
  name: "Error",
  inputs: [{ name: "message", type: "string" }],
} as const;
const solidityPanicAbiItem = {
  type: "error",
  name: "Panic",
  inputs: [{ name: "reason", type: "uint256" }],
} as const;

const EXPECTED_ERROR_NAMES = [
  "BridgeCannotBeZeroAddress",
  "BridgeMessageAlreadyProcessed",
  "BurningTokensDisallowedForUsers",
  "CallerIsNotBridge",
  "EnforcedPause",
  "ERC20InsufficientAllowance",
  "ERC20InsufficientBalance",
  "ERC20InvalidApprover",
  "ERC20InvalidReceiver",
  "ERC20InvalidSender",
  "ERC20InvalidSpender",
  "ExpectedPause",
  "InvalidBridgeTxInputs",
  "InvalidDestinationChainId",
  "NotRelayer",
  "OwnableInvalidOwner",
  "OwnableUnauthorizedAccount",
  "ReentrancyGuardReentrantCall",
  "RelayerCannotBeZeroAddress",
  "SafeERC20FailedOperation",
  "TokenCannotBeZeroAddress",
];

describe("bridgeErrorAbi", () => {
  test("contains all 21 distinct bridge error names", () => {
    const names = bridgeErrorAbi
      .filter((item) => item.type === "error")
      .map((item) => item.name);

    expect(new Set(names).size).toBe(21);
    for (const errorName of EXPECTED_ERROR_NAMES) {
      expect(names).toContain(errorName);
    }
  });
});

describe("decodeBridgeError", () => {
  test("decodes a BridgeMessageAlreadyProcessed revert into a human sentence naming the messageId", () => {
    const messageId = `0x${"ab".repeat(32)}` as Hex;
    const reverted = createRevertedError({
      errorName: "BridgeMessageAlreadyProcessed",
      args: [messageId],
    });

    const result = decodeBridgeError({ error: reverted });

    expect(result.kind).toBe("bridge-custom-error");
    expect(result.errorName).toBe("BridgeMessageAlreadyProcessed");
    expect(result.message).toContain(messageId);
  });

  test("falls back to unknown for a 4-byte selector absent from bridgeErrorAbi, without throwing", () => {
    const unknownSelector = "0xdeadbeef" as Hex;
    const reverted = new ContractFunctionRevertedError({
      abi: bridgeErrorAbi,
      data: unknownSelector,
      functionName: "bridgeTx",
    });

    const result = decodeBridgeError({ error: reverted });

    expect(result.kind).toBe("unknown");
    expect(result.message).toContain(unknownSelector);
    expect(result.rawData).toBe(unknownSelector);
  });

  test("returns unknown and never throws for undefined", () => {
    const result = decodeBridgeError({ error: undefined });

    expect(result.kind).toBe("unknown");
  });

  test("returns unknown and never throws for a plain Error", () => {
    const result = decodeBridgeError({ error: new Error("boom") });

    expect(result.kind).toBe("unknown");
  });

  test("returns unknown and never throws for a non-Error value", () => {
    const result = decodeBridgeError({ error: "not an error object" });

    expect(result.kind).toBe("unknown");
  });

  // NOTE: a ContractFunctionRevertedError carrying neither raw nor signature (zero-length revert
  // data) used to fall all the way through to this generic 'unknown' branch. The Task 2
  // `decodeEmptyRevertData` decoder is more specific and now intercepts that exact fixture first,
  // reclassifying it as 'out-of-gas' — see the "empty revert data" describe block below. The
  // generic 'unknown' + "no revert data" message is still exercised above (undefined/plain
  // Error/non-Error value), which is the one remaining path where `reverted` itself is absent.
});

describe("decodeBridgeError — Tier 1 bespoke copy", () => {
  test("decodes InvalidDestinationChainId naming both the expected and received chain id", () => {
    const reverted = createRevertedError({
      errorName: "InvalidDestinationChainId",
      args: [421614n, 84532n],
    });

    const result = decodeBridgeError({ error: reverted });

    expect(result.kind).toBe("bridge-custom-error");
    expect(result.message).toContain("421614");
    expect(result.message).toContain("84532");
  });

  test("decodes InvalidBridgeTxInputs naming the supplied recipient and amount", () => {
    const reverted = createRevertedError({
      errorName: "InvalidBridgeTxInputs",
      args: [zeroAddress, 0n],
    });

    const result = decodeBridgeError({ error: reverted });

    expect(result.kind).toBe("bridge-custom-error");
    expect(result.message).toContain(zeroAddress);
    expect(result.message).toContain("0");
  });

  test("decodes SafeERC20FailedOperation as token-operation-failed naming the token address", () => {
    const token = "0x1111111111111111111111111111111111111111" as const;
    const reverted = createRevertedError({
      errorName: "SafeERC20FailedOperation",
      args: [token],
    });

    const result = decodeBridgeError({ error: reverted });

    expect(result.kind).toBe("token-operation-failed");
    expect(result.message).toContain(token);
  });

  test("decodes ERC20InsufficientAllowance with 6-decimal renderings, directing the user to re-run approve", () => {
    const spender = "0x2222222222222222222222222222222222222222" as const;
    const reverted = createRevertedError({
      errorName: "ERC20InsufficientAllowance",
      args: [spender, 1_000_000n, 5_000_000n],
    });

    const result = decodeBridgeError({ error: reverted });

    expect(result.kind).toBe("insufficient-allowance");
    expect(result.message).toContain("1");
    expect(result.message).toContain("5");
    expect(result.message).not.toContain("1000000");
    expect(result.message).not.toContain("5000000");
    expect(result.message.toLowerCase()).toContain("approve");
  });

  test("ERC20InsufficientAllowance with args undefined still directs to re-run approve without printing undefined or an empty parenthetical", () => {
    // decodeErrorResult always attaches args when a real 3-input error decodes successfully, so
    // the "args unavailable" path is simulated by clearing the already-decoded `.data.args` on the
    // public property — the decoder's own undefined-guarded interpolation is what's under test.
    const reverted = createRevertedError({
      errorName: "ERC20InsufficientAllowance",
      args: ["0x3333333333333333333333333333333333333333", 1n, 1n],
    });
    if (reverted.data) reverted.data = { ...reverted.data, args: undefined };

    const result = decodeBridgeError({ error: reverted });

    expect(result.kind).toBe("insufficient-allowance");
    expect(result.message).not.toContain("undefined");
    expect(result.message).not.toContain("()");
    expect(result.message.toLowerCase()).toContain("approve");
  });
});

const TIER_TWO_NAMES = [
  "NotRelayer",
  "RelayerCannotBeZeroAddress",
  "TokenCannotBeZeroAddress",
  "BridgeCannotBeZeroAddress",
  "CallerIsNotBridge",
  "BurningTokensDisallowedForUsers",
  "OwnableUnauthorizedAccount",
  "OwnableInvalidOwner",
  "ReentrancyGuardReentrantCall",
  "EnforcedPause",
  "ExpectedPause",
] as const;

const TIER_TWO_ARGS: Record<string, readonly unknown[]> = {
  NotRelayer: ["0x4444444444444444444444444444444444444444"],
  CallerIsNotBridge: ["0x5555555555555555555555555555555555555555"],
  OwnableUnauthorizedAccount: ["0x6666666666666666666666666666666666666666"],
  OwnableInvalidOwner: ["0x7777777777777777777777777777777777777777"],
};

describe("decodeBridgeError — Tier 2 unmapped-custom-error", () => {
  for (const errorName of TIER_TWO_NAMES) {
    test(`${errorName} resolves to kind: 'unmapped-custom-error' with the error name in the message`, () => {
      const reverted = createRevertedError({
        errorName,
        args: TIER_TWO_ARGS[errorName] ?? [],
      });

      const result = decodeBridgeError({ error: reverted });

      expect(result.kind).toBe("unmapped-custom-error");
      expect(result.message).toContain(errorName);
    });
  }

  test("NotRelayer has no special-case branch anywhere in the decode chain (D-05)", () => {
    // Static-source guard companion — see the acceptance criterion:
    //   grep -v '^ *[/*]' ui/src/lib/decode-bridge-error.ts | grep -c "NotRelayer"
    // returns 0. This behavioural test just confirms NotRelayer still resolves correctly by
    // falling through like any other unmapped name (asserted above), not via a dedicated branch.
    const reverted = createRevertedError({
      errorName: "NotRelayer",
      args: TIER_TWO_ARGS.NotRelayer ?? [],
    });

    const result = decodeBridgeError({ error: reverted });

    expect(result.kind).toBe("unmapped-custom-error");
  });
});

const PANIC_CODES = [1, 17, 18, 33, 34, 49, 50, 65, 81] as const;

describe("decodeBridgeError — Panic(uint256)", () => {
  test("code 17 describes arithmetic overflow/underflow and contains 0x11", () => {
    const result = decodeBridgeError({ error: createPanicRevert(17n) });

    expect(result.kind).toBe("panic");
    expect(result.message.toLowerCase()).toContain("overflow");
    expect(result.message).toContain("0x11");
  });

  test("code 18 describes division or modulo by zero and contains 0x12", () => {
    const result = decodeBridgeError({ error: createPanicRevert(18n) });

    expect(result.kind).toBe("panic");
    expect(result.message.toLowerCase()).toContain("divide");
    expect(result.message).toContain("0x12");
  });

  test("all nine documented panic codes produce nine mutually distinct messages", () => {
    const messages = PANIC_CODES.map(
      (code) =>
        decodeBridgeError({ error: createPanicRevert(BigInt(code)) }).message,
    );

    expect(new Set(messages).size).toBe(PANIC_CODES.length);
    for (const result of PANIC_CODES.map((code) =>
      decodeBridgeError({ error: createPanicRevert(BigInt(code)) }),
    )) {
      expect(result.kind).toBe("panic");
    }
  });

  test("an undocumented panic code still yields kind: panic, never kind: unknown", () => {
    const result = decodeBridgeError({ error: createPanicRevert(255n) });

    expect(result.kind).toBe("panic");
    expect(result.message).toContain("0xff");
  });
});

describe("decodeBridgeError — revert-string (Error(string))", () => {
  test("a Solidity revert string decodes to kind: revert-string containing the reason", () => {
    const result = decodeBridgeError({
      error: createErrorStringRevert("boom"),
    });

    expect(result.kind).toBe("revert-string");
    expect(result.message).toContain("boom");
  });

  test("a revert reason longer than 200 characters is truncated with an ellipsis", () => {
    const longReason = "x".repeat(250);
    const result = decodeBridgeError({
      error: createErrorStringRevert(longReason),
    });

    expect(result.kind).toBe("revert-string");
    expect(result.message).toContain("...");
    expect(result.message.length).toBeLessThan(longReason.length + 50);
  });
});

describe("decodeBridgeError — wallet rejection", () => {
  test("a UserRejectedRequestError anywhere in the cause chain resolves to kind: wallet-rejected", () => {
    const rejection = new UserRejectedRequestError(new Error("user rejected"));

    const result = decodeBridgeError({ error: rejection });

    expect(result.kind).toBe("wallet-rejected");
    expect(result.message.toLowerCase()).toContain("rejected");
  });

  test("an error whose only rejection signal is a numeric code of 4001, with no typed class, still resolves to wallet-rejected", () => {
    const rejection = { code: 4001, message: "User rejected the request." };

    const result = decodeBridgeError({ error: rejection });

    expect(result.kind).toBe("wallet-rejected");
  });

  test("wallet-rejected is distinct from every on-chain failure kind", () => {
    const rejection = new UserRejectedRequestError(new Error("user rejected"));
    const revert = createRevertedError({
      errorName: "BridgeMessageAlreadyProcessed",
      args: [`0x${"ab".repeat(32)}` as Hex],
    });

    const rejected = decodeBridgeError({ error: rejection });
    const reverted = decodeBridgeError({ error: revert });

    expect(rejected.kind).not.toBe(reverted.kind);
  });
});

describe("decodeBridgeError — empty revert data (out-of-gas)", () => {
  test('raw "0x" with no decoded data resolves to kind: out-of-gas, never unknown or revert-string', () => {
    const reverted = new ContractFunctionRevertedError({
      abi: bridgeErrorAbi,
      data: "0x",
      functionName: "bridgeTx",
    });

    const result = decodeBridgeError({ error: reverted });

    expect(result.kind).toBe("out-of-gas");
  });

  test('raw undefined with no decoded data resolves identically to raw "0x"', () => {
    const reverted = new ContractFunctionRevertedError({
      abi: bridgeErrorAbi,
      functionName: "bridgeTx",
    });

    const result = decodeBridgeError({ error: reverted });

    expect(result.kind).toBe("out-of-gas");
  });

  test('raw "0X" (uppercase prefix) classifies identically to "0x"', () => {
    const reverted = new ContractFunctionRevertedError({
      abi: bridgeErrorAbi,
      data: "0X" as unknown as Hex,
      functionName: "bridgeTx",
    });

    const result = decodeBridgeError({ error: reverted });

    expect(result.kind).toBe("out-of-gas");
  });
});

describe("decodeBridgeError — insufficient native gas", () => {
  test("an explicit gasEstimate on Base Sepolia names the chain, the faucet, and the computed figure", () => {
    const error = new InsufficientFundsError();

    const result = decodeBridgeError({
      error,
      chainId: 84532,
      gasEstimate: { gas: 200_000n, feePerGas: 1_500_000_000n },
    });

    expect(result.kind).toBe("insufficient-gas");
    expect(result.message).toContain("Base Sepolia");
    expect(result.message).toContain("0.0003");
    expect(result.message).toContain("alchemy.com/faucets/base-sepolia");
  });

  test("an explicit gasEstimate on Arbitrum Sepolia names the chain and its own faucet", () => {
    const error = new InsufficientFundsError();

    const result = decodeBridgeError({
      error,
      chainId: 421614,
      gasEstimate: { gas: 200_000n, feePerGas: 1_500_000_000n },
    });

    expect(result.kind).toBe("insufficient-gas");
    expect(result.message).toContain("Arbitrum Sepolia");
    expect(result.message).toContain("alchemy.com/faucets/arbitrum-sepolia");
  });

  test("a figure recovered from metaMessages is used instead of the default, and differs from 0.0004", () => {
    const insufficientFunds = new InsufficientFundsError();
    const wrapped = createEstimateGasErrorWithArgs({
      cause: insufficientFunds,
      gas: 500_000n,
      maxFeePerGas: 2_000_000_000n,
    });

    const result = decodeBridgeError({ error: wrapped, chainId: 84532 });

    expect(result.kind).toBe("insufficient-gas");
    expect(result.message).not.toContain("0.0004");
    expect(result.message).toContain("0.001");
  });

  test("neither gasEstimate nor a parseable arguments block available falls back to the 0.0004 default, still naming the chain and faucet, without claiming it was measured", () => {
    const error = new InsufficientFundsError();

    const result = decodeBridgeError({ error, chainId: 84532 });

    expect(result.kind).toBe("insufficient-gas");
    expect(result.message).toContain("0.0004");
    expect(result.message).toContain("Base Sepolia");
    expect(result.message).toContain("alchemy.com/faucets/base-sepolia");
    expect(result.message.toLowerCase()).not.toContain("you need ~0.0004");
  });

  test("gas: 0n falls back to the 0.0004 default, never rendering 0 ETH or NaN", () => {
    const error = new InsufficientFundsError();

    const result = decodeBridgeError({
      error,
      chainId: 84532,
      gasEstimate: { gas: 0n, feePerGas: 1_500_000_000n },
    });

    expect(result.kind).toBe("insufficient-gas");
    expect(result.message).toContain("0.0004");
    expect(result.message).not.toContain("0 ETH");
    expect(result.message).not.toContain("NaN");
  });

  test("an unrecognised chainId yields a message containing neither faucet URL", () => {
    const error = new InsufficientFundsError();

    const result = decodeBridgeError({
      error,
      chainId: 999_999,
      gasEstimate: { gas: 200_000n, feePerGas: 1_500_000_000n },
    });

    expect(result.kind).toBe("insufficient-gas");
    expect(result.message).not.toContain("alchemy.com/faucets/base-sepolia");
    expect(result.message).not.toContain(
      "alchemy.com/faucets/arbitrum-sepolia",
    );
  });

  test("an absent chainId yields a message containing neither faucet URL", () => {
    const error = new InsufficientFundsError();

    const result = decodeBridgeError({
      error,
      gasEstimate: { gas: 200_000n, feePerGas: 1_500_000_000n },
    });

    expect(result.kind).toBe("insufficient-gas");
    expect(result.message).not.toContain("alchemy.com/faucets/base-sepolia");
    expect(result.message).not.toContain(
      "alchemy.com/faucets/arbitrum-sepolia",
    );
  });
});

// The full declared union, spelled out here so this file fails to typecheck (missing property on
// KIND_FIXTURES below) the moment a kind is added to DecodedBridgeErrorKind without a
// corresponding fixture — the companion invariant test accepted in 01-01-PLAN.md's
// `<assumption_delta_decision>`.
const ALL_KINDS: DecodedBridgeErrorKind[] = [
  "bridge-custom-error",
  "unmapped-custom-error",
  "token-operation-failed",
  "insufficient-allowance",
  "insufficient-gas",
  "wallet-rejected",
  "out-of-gas",
  "panic",
  "revert-string",
  "unknown",
];

const KIND_FIXTURES: Record<DecodedBridgeErrorKind, DecodeBridgeErrorInput> = {
  "bridge-custom-error": {
    error: createRevertedError({
      errorName: "BridgeMessageAlreadyProcessed",
      args: [`0x${"ab".repeat(32)}` as Hex],
    }),
  },
  "unmapped-custom-error": {
    error: createRevertedError({
      errorName: "NotRelayer",
      args: ["0x4444444444444444444444444444444444444444"],
    }),
  },
  "token-operation-failed": {
    error: createRevertedError({
      errorName: "SafeERC20FailedOperation",
      args: ["0x1111111111111111111111111111111111111111"],
    }),
  },
  "insufficient-allowance": {
    error: createRevertedError({
      errorName: "ERC20InsufficientAllowance",
      args: [
        "0x2222222222222222222222222222222222222222",
        1_000_000n,
        5_000_000n,
      ],
    }),
  },
  "insufficient-gas": {
    error: new InsufficientFundsError(),
    chainId: 84532,
    gasEstimate: { gas: 200_000n, feePerGas: 1_500_000_000n },
  },
  "wallet-rejected": {
    error: new UserRejectedRequestError(new Error("user rejected")),
  },
  "out-of-gas": {
    error: new ContractFunctionRevertedError({
      abi: bridgeErrorAbi,
      data: "0x",
      functionName: "bridgeTx",
    }),
  },
  panic: { error: createPanicRevert(17n) },
  "revert-string": { error: createErrorStringRevert("boom") },
  unknown: {
    error: new ContractFunctionRevertedError({
      abi: bridgeErrorAbi,
      data: "0xdeadbeef" as Hex,
      functionName: "bridgeTx",
    }),
  },
};

describe("decodeBridgeError — exhaustiveness invariant (ERR-09 / assumption-delta companion test)", () => {
  test("every declared kind is reachable from at least one fixture", () => {
    for (const kind of ALL_KINDS) {
      const result = decodeBridgeError(KIND_FIXTURES[kind]);
      expect(result.kind).toBe(kind);
    }
  });

  test("the set of observed kinds across the whole table equals the full declared union", () => {
    const observed = new Set(
      ALL_KINDS.map((kind) => decodeBridgeError(KIND_FIXTURES[kind]).kind),
    );

    expect(observed.size).toBe(ALL_KINDS.length);
    expect([...observed].sort()).toEqual([...ALL_KINDS].sort());
  });

  test("decodeBridgeError is total: it never throws and always returns a non-empty DecodedBridgeError", () => {
    const nonErrorInputs: unknown[] = [
      undefined,
      null,
      new Error("a plain error"),
      "a bare string",
      { not: "an error" },
      new BaseError("an empty-cause BaseError"),
    ];

    for (const error of nonErrorInputs) {
      expect(() => decodeBridgeError({ error })).not.toThrow();

      const result = decodeBridgeError({ error });
      expect(result).toBeDefined();
      expect(ALL_KINDS).toContain(result.kind);
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  test("the generic unknown kind is reachable only for an unrecognised selector — no mapped-kind fixture falls through to it", () => {
    for (const kind of ALL_KINDS) {
      if (kind === "unknown") continue;

      const result = decodeBridgeError(KIND_FIXTURES[kind]);
      expect(result.kind).not.toBe("unknown");
    }
  });
});

function createRevertedError({
  errorName,
  args,
}: {
  errorName: string;
  args: readonly unknown[];
}): ContractFunctionRevertedError {
  const data = encodeErrorResult({
    abi: bridgeErrorAbi,
    errorName,
    args,
  });

  return new ContractFunctionRevertedError({
    abi: bridgeErrorAbi,
    data,
    functionName: "finalizeBridgeTx",
  });
}

function createPanicRevert(code: bigint): ContractFunctionRevertedError {
  const data = encodeErrorResult({
    abi: [solidityPanicAbiItem],
    errorName: "Panic",
    args: [code],
  });

  return new ContractFunctionRevertedError({
    abi: bridgeErrorAbi,
    data,
    functionName: "bridgeTx",
  });
}

function createErrorStringRevert(
  reason: string,
): ContractFunctionRevertedError {
  const data = encodeErrorResult({
    abi: [solidityErrorAbiItem],
    errorName: "Error",
    args: [reason],
  });

  return new ContractFunctionRevertedError({
    abi: bridgeErrorAbi,
    data,
    functionName: "bridgeTx",
  });
}

function createEstimateGasErrorWithArgs({
  cause,
  gas,
  maxFeePerGas,
}: {
  cause: InsufficientFundsError;
  gas: bigint;
  maxFeePerGas: bigint;
}): EstimateGasExecutionError {
  // `EstimateGasExecutionError`'s second constructor param has a large generic surface
  // (`EstimateGasParameters<any>`) that isn't worth reproducing in full for a test fixture — the
  // fields under test (`gas`, `maxFeePerGas`) are what get rendered into the real
  // `'Estimate Gas Arguments:'` prettyPrint block our decoder parses.
  return new EstimateGasExecutionError(cause, { gas, maxFeePerGas } as never);
}
