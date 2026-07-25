# Improve Tx Flow

Goal: Improve the UI of tx flow, so that it is more friendly for the user, the UX looks more professional, and the user knows at which state exactly its bridge transaction is.

- The button should change based on the transaction state.
- I want to display different messages on the buttons and in the stepper depending on the transaction state
- I want to use useSimulate from Wagmi to check first if the transaction will go through before to open the user wallet. If the transaction does not go through. Use the `collateral-abi.json` and `synthetic-abi.json` files to decode it.

## Decoding errors

Rich custom errors designed for calldata debugging. The JD wants someone who "debugs a failed transaction by inspecting calldata." Make your errors carry evidence: MessageAlreadyProcessed(bytes32 messageId), WrongDestinationChain(uint256 expected, uint256 actual), UnauthorizedRelayer(address caller). Then the UI can decodeErrorResult against the ABI and show readable failures — errors and UI improve together

Also add a small error decoding if the error is related to not enough native tokens to pay for the gas. Just a small error-mapping layer (just for this use case for now, that mention in comment that it can be added more into it). Build a small error-mapping layer: insufficient ETH → "You need ~0.0004 ETH on Base Sepolia for gas — here's the faucet"; allowance too low → re-run approve

## Stepper details

Use shadcn and make it a stepper. 
https://shadcnstudio.com/docs/components/stepper?base=base

On the left side, below the “L2 Bridge” title and the explanations.

The steps should be:
1. Bridge Approved
2. Bridge tx submitted
3. Bridge Tx relayed

# Transaction state

On each step of the stepper + in the stepper under each step, depending if the transaction is pending or confirmed, it should:
1. show a blue spinner vs a green checkmark
2. Use different text as follow
    2.a: if the tx is pending (isPending from useWriteContract) = “Your transaction is being submitted to the network..”
    2.b if the tx is “processing” (isFetching from useWaitForTransactionReceipt) = “Your transaction has been picked up and is being processed…”
    2.c if the tx is confirmed (isSuccess from useWaitForTransactionReceipt) = “Your transaction has completed successfully!”

Below are some examples of code patterns to follow for examples

```
import React from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

type ButtonProps = {
  variant: 'success' | 'error' | 'info' | 'config' | 'default';
  children: React.ReactNode;
  onClick: () => void;
  isPending: boolean;
  isTxProcessing: boolean;
  icon: React.ReactNode;
  disabled?: boolean;
};

const ButtonTransaction: React.FC<ButtonProps> = ({
  variant = 'default',
  children,
  onClick,
  isPending,
  isTxProcessing,
  icon,
  disabled,
}) => (
  <Button
    onClick={onClick}
    variant={variant}
    disabled={isPending || isTxProcessing || disabled}
  >
    {isPending || isTxProcessing ? <Spinner /> : icon}

    {isPending && <span>Waiting for confirmation...</span>}
    {isTxProcessing && <span>Transaction in progress...</span>}
    {!isPending && !isTxProcessing && <span>{children}</span>}
  </Button>
);

export default ButtonTransaction;
```

```
  // Logic for writing to the contract
  const { data: txHash, writeContract, isPending } = useWriteContract();

  const { isSuccess: txConfirmed, isFetching: isTxProcessing } =
    useWaitForTransactionReceipt({
      hash: txHash,
    });
```

