import { ethers, BigNumber } from "ethers";
import { addresses, messages } from "../constants";
import { abi as ierc20Abi } from "../abi/IERC20.json";
import { abi as PapaStaking } from "../abi/PapaStakingv2.json";
import { abi as StakingHelper } from "../abi/StakingHelper.json";
import { clearPendingTxn, fetchPendingTxns, getStakingTypeText } from "./PendingTxnsSlice";
import { createAsyncThunk } from "@reduxjs/toolkit";
import { fetchAccountSuccess, getBalances, loadAccountDetails } from "./AccountSlice";
import { error, info, success } from "../slices/MessagesSlice";
import { IActionValueAsyncThunk, IChangeApprovalAsyncThunk, IJsonRPCError } from "./interfaces";
import { metamaskErrorWrap } from "src/helpers/MetamaskErrorWrap";
import { sleep } from "../helpers/Sleep"

interface IUAData {
  address: string;
  value: string;
  approved: boolean;
  txHash: string | null;
  type: string | null;
}

function alreadyApprovedToken(token: string, stakeAllowance: BigNumber, unstakeAllowance: BigNumber) {
  // set defaults
  let bigZero = BigNumber.from("0");
  let applicableAllowance = bigZero;

  // determine which allowance to check
  if (token === "papa") {
    applicableAllowance = stakeAllowance;
  } else if (token === "spapa") {
    applicableAllowance = unstakeAllowance;
  }

  // check if allowance exists
  if (applicableAllowance.gt(bigZero)) return true;

  return false;
}

export const changeApproval = createAsyncThunk(
  "stake/changeApproval",
  async ({ token, provider, address, networkID }: IChangeApprovalAsyncThunk, { dispatch }) => {
    if (!provider) {
      dispatch(error("Please connect your wallet!"));
      return;
    }

    const signer = provider.getSigner();
    const papaContract = new ethers.Contract(addresses[networkID].PAPA_ADDRESS as string, ierc20Abi, signer);
    const spapaContract = new ethers.Contract(addresses[networkID].SPAPA_ADDRESS as string, ierc20Abi, signer);
    const oldspapaContract = new ethers.Contract(addresses[networkID].OLD_SPAPA_ADDRESS as string, ierc20Abi, signer);
    let approveTx;
    let stakeAllowance = await papaContract.allowance(address, addresses[networkID].STAKING_HELPER_ADDRESS);
    let unstakeAllowance = await spapaContract.allowance(address, addresses[networkID].STAKING_ADDRESS);
    let oldunstakeAllowance = await oldspapaContract.allowance(address, addresses[networkID].OLD_STAKING_ADDRESS);

    // return early if approval has already happened
    if (alreadyApprovedToken(token, stakeAllowance, unstakeAllowance)) {
      dispatch(info("Approval completed."));
      return dispatch(
        fetchAccountSuccess({
          staking: {
            papaStake: +stakeAllowance,
            papaUnstake: +unstakeAllowance,
            oldpapaUnstake: +oldunstakeAllowance,
          },
        }),
      );
    }

    try {
      if (token === "papa") {
        // won't run if stakeAllowance > 0
        approveTx = await papaContract.approve(
          addresses[networkID].STAKING_HELPER_ADDRESS,
          ethers.utils.parseUnits("1000000000", "gwei").toString(),
        );
      } else if (token === "spapa") {
        approveTx = await spapaContract.approve(
          addresses[networkID].STAKING_ADDRESS,
          ethers.utils.parseUnits("1000000000", "gwei").toString(),
        );
      } else if (token === "oldspapa") {
        approveTx = await oldspapaContract.approve(
          addresses[networkID].OLD_STAKING_ADDRESS,
          ethers.utils.parseUnits("1000000000", "gwei").toString(),
        );
      }

      const text = "Approve " + (token === "papa" ? "Staking" : "Unstaking");
      const pendingTxnType = token === "papa" ? "approve_staking" : "approve_unstaking";
      dispatch(fetchPendingTxns({ txnHash: approveTx.hash, text, type: pendingTxnType }));

      await approveTx.wait();
      dispatch(success(messages.tx_successfully_send));
    } catch (e: any) {``
      // dispatch(error((e as IJsonRPCError).message));
      return metamaskErrorWrap(e, dispatch);
    } finally {
      if (approveTx) {
        dispatch(clearPendingTxn(approveTx.hash));
      }
    }

    await sleep(2);

    // go get fresh allowances
    stakeAllowance = await papaContract.allowance(address, addresses[networkID].STAKING_HELPER_ADDRESS);
    unstakeAllowance = await spapaContract.allowance(address, addresses[networkID].STAKING_ADDRESS);
    oldunstakeAllowance = await spapaContract.allowance(address, addresses[networkID].OLD_STAKING_ADDRESS);

    return dispatch(
      fetchAccountSuccess({
        staking: {
          papaStake: +stakeAllowance,
          papaUnstake: +unstakeAllowance,
          oldpapaUnstake: +oldunstakeAllowance,
        },
      }),
    );
  },
);

export const changeStake = createAsyncThunk(
  "stake/changeStake",
  async ({ action, value, provider, address, networkID, callback, isOld }: IActionValueAsyncThunk, { dispatch }) => {
    if (!provider) {
      dispatch(error("Please connect your wallet!"));
      return;
    }

    const signer = provider.getSigner();
    let staking, stakingHelper;
    if (isOld) {
      staking = new ethers.Contract(addresses[networkID].OLD_STAKING_ADDRESS as string, PapaStaking, signer);
      stakingHelper = new ethers.Contract(
        addresses[networkID].OLD_STAKING_HELPER_ADDRESS as string,
        StakingHelper,
        signer,
      );
    } else {
      staking = new ethers.Contract(addresses[networkID].STAKING_ADDRESS as string, PapaStaking, signer);
      stakingHelper = new ethers.Contract(addresses[networkID].STAKING_HELPER_ADDRESS as string, StakingHelper, signer);
    }

    let stakeTx;
    let uaData: IUAData = {
      address: address,
      value: value,
      approved: true,
      txHash: null,
      type: null,
    };

    try {
      if (action === "stake") {
        uaData.type = "stake";
        stakeTx = await stakingHelper.stake(ethers.utils.parseUnits(value, "gwei"), address);
      } else {
        uaData.type = "unstake";
        stakeTx = await staking.unstake(ethers.utils.parseUnits(value, "gwei"), true);
      }
      const pendingTxnType = action === "stake" ? "staking" : "unstaking";
      uaData.txHash = stakeTx.hash;
      dispatch(fetchPendingTxns({ txnHash: stakeTx.hash, text: getStakingTypeText(action), type: pendingTxnType }));
      callback?.();
      await stakeTx.wait();
      dispatch(success(messages.tx_successfully_send));
    } catch (e: any) {
      return metamaskErrorWrap(e, dispatch);
    } finally {
      if (stakeTx) {
        dispatch(clearPendingTxn(stakeTx.hash));
      }
    }
    await sleep(7);
    dispatch(info(messages.balance_update_soon));
    await sleep(15);
    await dispatch(loadAccountDetails({ address, networkID, provider }));
    dispatch(info(messages.balance_updated));
    return;
  },
);

export const changeForfeit = createAsyncThunk(
  "stake/forfeit",
  async ({ provider, address, networkID }: IActionValueAsyncThunk, { dispatch }) => {
    if (!provider) {
      dispatch(error("Please connect your wallet!"));
      return;
    }

    const signer = provider.getSigner();
    const staking = new ethers.Contract(addresses[networkID].STAKING_ADDRESS as string, PapaStaking, signer);
    let forfeitTx;

    try {
      forfeitTx = await staking.forfeit();
      const text = "Forfeiting";
      const pendingTxnType = "forfeiting";
      dispatch(fetchPendingTxns({ txnHash: forfeitTx.hash, text, type: pendingTxnType }));
      await forfeitTx.wait();
      dispatch(success(messages.tx_successfully_send));
    } catch (e: any) {
      return metamaskErrorWrap(e, dispatch);
    } finally {
      if (forfeitTx) {
        dispatch(clearPendingTxn(forfeitTx.hash));
      }
    }
    await sleep(7);
    dispatch(info(messages.balance_update_soon));
    await sleep(15);
    await dispatch(loadAccountDetails({ address, networkID, provider }));
    dispatch(info(messages.balance_updated));
    return;
  },
);

export const changeClaim = createAsyncThunk(
  "stake/changeClaim",
  async ({ provider, address, networkID }: IActionValueAsyncThunk, { dispatch }) => {
    if (!provider) {
      dispatch(error("Please connect your wallet!"));
      return;
    }

    const signer = provider.getSigner();
    const staking = new ethers.Contract(addresses[networkID].STAKING_ADDRESS as string, PapaStaking, signer);
    let claimTx;

    try {
      claimTx = await staking.claim(address);
      const text = "Claiming";
      const pendingTxnType = "claiming";
      dispatch(fetchPendingTxns({ txnHash: claimTx.hash, text, type: pendingTxnType }));
      await claimTx.wait();
      dispatch(success(messages.tx_successfully_send));
    } catch (e: any) {
      return metamaskErrorWrap(e, dispatch);
    } finally {
      if (claimTx) {
        dispatch(clearPendingTxn(claimTx.hash));
      }
    }
    await sleep(7);
    dispatch(info(messages.balance_update_soon));
    await sleep(7);
    await dispatch(loadAccountDetails({ address, networkID, provider }));
    dispatch(info(messages.balance_updated));
    return;
  },
);
