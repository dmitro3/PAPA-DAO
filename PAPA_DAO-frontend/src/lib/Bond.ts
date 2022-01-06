import { StaticJsonRpcProvider, JsonRpcSigner } from "@ethersproject/providers";
import { BigNumber, ethers } from "ethers";
import { abi as MimBondContract } from "src/abi/bonds/MimContract.json";
import { abi as ierc20Abi } from "src/abi/IERC20.json";
import { getBondCalculator, getBondCalculator1 } from "src/helpers/BondCalculator";
import { addresses } from "src/constants";
import React from "react";

export enum NetworkID {
  Mainnet = 43114,
  Testnet = 0xfa2,
}

export enum BondType {
  StableAsset,
  LP,
}

export interface BondAddresses {
  reserveAddress: string;
  bondAddress: string;
}

export interface NetworkAddresses {
  [NetworkID.Mainnet]: BondAddresses;
  [NetworkID.Testnet]: BondAddresses;
}

interface BondOpts {
  name: string; // Internal name used for references
  displayName: string; // Displayname on UI
  bondIconSvg: React.ReactNode; //  SVG path for icons
  bondContractABI: ethers.ContractInterface; // ABI for contract
  networkAddrs: NetworkAddresses; // Mapping of network --> Addresses
  bondToken: string; // Unused, but native token to buy the bond.
  isFour?: Boolean;
  isTotal?: Boolean;
  isOld?: Boolean;
  decimals?: number;
  fourAddress?: string;
  additionValue?: number;
  substractionValue?: number;
}

// Technically only exporting for the interface
export abstract class Bond {
  // Standard Bond fields regardless of LP bonds or stable bonds.
  readonly name: string;
  readonly displayName: string;
  readonly type: BondType;
  readonly bondIconSvg: React.ReactNode;
  readonly bondContractABI: ethers.ContractInterface; // Bond ABI
  readonly networkAddrs: NetworkAddresses;
  readonly bondToken: string;
  readonly isFour?: Boolean;
  readonly isTotal?: Boolean;
  readonly isOld?: Boolean;
  readonly decimals?: number;
  readonly fourAddress?: string;
  readonly additionValue?: number;
  readonly substractionValue?: number;

  // The following two fields will differ on how they are set depending on bond type
  abstract isLP: Boolean;
  abstract reserveContract: ethers.ContractInterface; // Token ABI
  abstract displayUnits: string;

  // Async method that returns a Promise
  abstract getTreasuryBalance(networkID: NetworkID, provider: StaticJsonRpcProvider): Promise<number>;

  constructor(type: BondType, bondOpts: BondOpts) {
    this.name = bondOpts.name;
    this.displayName = bondOpts.displayName;
    this.type = type;
    this.bondIconSvg = bondOpts.bondIconSvg;
    this.bondContractABI = bondOpts.bondContractABI;
    this.networkAddrs = bondOpts.networkAddrs;
    this.bondToken = bondOpts.bondToken;
    this.isFour = bondOpts.isFour;
    this.isTotal = bondOpts.isTotal;
    this.isOld = bondOpts.isOld;
    this.decimals = bondOpts.decimals;
    this.fourAddress = bondOpts.fourAddress;
    this.additionValue = bondOpts.additionValue;
    this.substractionValue = bondOpts.substractionValue;
  }

  getAddressForBond(networkID: NetworkID) {
    return this.networkAddrs[networkID].bondAddress;
  }
  getContractForBond(networkID: NetworkID, provider: StaticJsonRpcProvider | JsonRpcSigner) {
    const bondAddress = this.getAddressForBond(networkID);
    return new ethers.Contract(bondAddress, this.bondContractABI, provider);
  }

  getAddressForReserve(networkID: NetworkID) {
    return this.networkAddrs[networkID].reserveAddress;
  }
  getContractForReserve(networkID: NetworkID, provider: StaticJsonRpcProvider | JsonRpcSigner) {
    const bondAddress = this.getAddressForReserve(networkID);
    return new ethers.Contract(bondAddress, this.reserveContract, provider);
  }

  async getBondReservePrice(networkID: NetworkID, provider: StaticJsonRpcProvider | JsonRpcSigner) {
    const pairContract = this.getContractForReserve(networkID, provider);
    const reserves = await pairContract.getReserves();
    const marketPrice = reserves[1] / reserves[0] / Math.pow(10, 9);

    return marketPrice;
  }
}

// Keep all LP specific fields/logic within the LPBond class
export interface LPBondOpts extends BondOpts {
  reserveContract: ethers.ContractInterface;
  lpUrl: string;
}

export class LPBond extends Bond {
  readonly isLP = true;
  readonly lpUrl: string;
  readonly reserveContract: ethers.ContractInterface;
  readonly displayUnits: string;

  constructor(lpBondOpts: LPBondOpts) {
    super(BondType.LP, lpBondOpts);

    this.lpUrl = lpBondOpts.lpUrl;
    this.reserveContract = lpBondOpts.reserveContract;
    this.displayUnits = "LP";
  }
  async getTreasuryBalance(networkID: NetworkID, provider: StaticJsonRpcProvider) {
    const token = this.getContractForReserve(networkID, provider);
    const tokenAddress = this.getAddressForReserve(networkID);
    let bondCalculator;
    bondCalculator = getBondCalculator(networkID, provider);

    let tokenAmount = await token.balanceOf(addresses[networkID].TREASURY_ADDRESS);
    if (this.isTotal) {
      let bond = this.getContractForBond(networkID, provider);
      tokenAmount = await bond.totalPrinciple();
    }
    if (this.substractionValue) {
      tokenAmount = tokenAmount.sub(BigInt(this.substractionValue));
    }
    if (this.additionValue) {
      tokenAmount = tokenAmount.add(BigInt(this.additionValue));
    }
    if (this.fourAddress) {
      const fourBond = new ethers.Contract(this.fourAddress, MimBondContract, provider);
      const val = await fourBond.totalPrinciple();
      tokenAmount = BigNumber.from(tokenAmount).sub(val);
    }
    const valuation = await bondCalculator.valuation(tokenAddress, tokenAmount);
    const markdown = await bondCalculator.markdown(tokenAddress);

    let tokenUSD;
    tokenUSD = (valuation / Math.pow(10, 9)) * (markdown / Math.pow(10, 18));
    return tokenUSD;
  }
}

// Generic BondClass we should be using everywhere
// Assumes the token being deposited follows the standard ERC20 spec
export interface StableBondOpts extends BondOpts {}
export class StableBond extends Bond {
  readonly isLP = false;
  readonly reserveContract: ethers.ContractInterface;
  readonly displayUnits: string;
  readonly isTotal?: Boolean;

  constructor(stableBondOpts: StableBondOpts) {
    super(BondType.StableAsset, stableBondOpts);
    // For stable bonds the display units are the same as the actual token
    this.displayUnits = stableBondOpts.displayName;
    this.reserveContract = ierc20Abi; // The Standard ierc20Abi since they're normal tokens
    this.isTotal = stableBondOpts.isTotal;
  }

  async getTreasuryBalance(networkID: NetworkID, provider: StaticJsonRpcProvider) {
    let token = this.getContractForReserve(networkID, provider);
    let tokenAmount = await token.balanceOf(addresses[networkID].TREASURY_ADDRESS);
    let decimals = 18;
    if (this.decimals) {
      decimals = this.decimals;
    }
    let treasuryBalane;
    treasuryBalane = tokenAmount / Math.pow(10, decimals);
    if (this.isTotal) {
      let bond = this.getContractForBond(networkID, provider);
      treasuryBalane = (await bond.totalPrinciple()) / Math.pow(10, decimals);
    }
    if (this.fourAddress) {
      const fourBond = new ethers.Contract(this.fourAddress, MimBondContract, provider);
      treasuryBalane -= (await fourBond.totalPrinciple()) / Math.pow(10, decimals);
    }
    if (this.additionValue) {
      treasuryBalane += this.additionValue / Math.pow(10, decimals);
    }
    return treasuryBalane;
  }
}

// These are special bonds that have different valuation methods
export interface CustomBondOpts extends BondOpts {
  reserveContract: ethers.ContractInterface;
  bondType: number;
  lpUrl: string;
  customTreasuryBalanceFunc: (
    this: CustomBond,
    networkID: NetworkID,
    provider: StaticJsonRpcProvider,
  ) => Promise<number>;
}
export class CustomBond extends Bond {
  readonly isLP: Boolean;
  getTreasuryBalance(networkID: NetworkID, provider: StaticJsonRpcProvider): Promise<number> {
    throw new Error("Method not implemented.");
  }
  readonly reserveContract: ethers.ContractInterface;
  readonly displayUnits: string;
  readonly lpUrl: string;

  constructor(customBondOpts: CustomBondOpts) {
    super(customBondOpts.bondType, customBondOpts);

    if (customBondOpts.bondType === BondType.LP) {
      this.isLP = true;
    } else {
      this.isLP = false;
    }
    this.lpUrl = customBondOpts.lpUrl;
    // For stable bonds the display units are the same as the actual token
    this.displayUnits = customBondOpts.displayName;
    this.reserveContract = customBondOpts.reserveContract;
    this.getTreasuryBalance = customBondOpts.customTreasuryBalanceFunc.bind(this);
  }
}
