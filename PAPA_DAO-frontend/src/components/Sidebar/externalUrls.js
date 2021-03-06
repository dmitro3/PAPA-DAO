import { ReactComponent as ForumIcon } from "../../assets/icons/forum.svg";
import { ReactComponent as GovIcon } from "../../assets/icons/governance.svg";
import { ReactComponent as DocsIcon } from "../../assets/icons/docs.svg";
import { ReactComponent as TraderJoeIcon } from "../../assets/icons/traderjoe.svg";
import { ReactComponent as SpiritSwapIcon } from "../../assets/icons/spiritswap.svg";
import { ReactComponent as FeedbackIcon } from "../../assets/icons/feedback.svg";
import { SvgIcon } from "@material-ui/core";
import { AccountBalanceOutlined, MonetizationOnOutlined } from "@material-ui/icons";

const externalUrls = [
  {
    title: "Buy on Trader Joe",
    url: "https://traderjoexyz.com/trade?inputCurrency=0x130966628846BFd36ff31a822705796e8cb8C18D&outputCurrency=0x70b33ebC5544C12691d055b49762D0F8365d99Fe#/",
    icon: <SvgIcon viewBox="0 0 64 64" color="primary" component={TraderJoeIcon} />,
  },
  // {
  //   title: "Buy on SpiritSwap",
  //   url: "https://swap.spiritswap.finance/#/exchange/swap/0x5c4fdfc5233f935f20d2adba572f770c2e377ab0",
  //   icon: <SvgIcon viewBox="0 0 155 172" color="primary" component={SpiritSwapIcon} />,
  // },
  // {
  //   title: "Papa Lend",
  //   label: "(Coming soon)",
  //   icon: <MonetizationOnOutlined viewBox="0 0 20 24" />,
  // },
  {
    title: "PAPA Bank",
    label: "(Coming soon)",
    icon: <AccountBalanceOutlined viewBox="0 0 20 24" />,
  },
  {
    title: "PAPA Pro",
    label: "(Coming soon)",
    icon: <MonetizationOnOutlined viewBox="0 0 20 24" />,
  },
  // {
  //   title: "Governance",
  //   url: "https://snapshot.org/#/papardao.co",
  //   icon: <SvgIcon color="primary" component={GovIcon} />,
  // },
  {
    title: "Docs",
    url: "https://papadao.gitbook.io/papadao/papa-dao/introduction",
    icon: <SvgIcon color="primary" component={DocsIcon} />,
  },
];

export default externalUrls;
