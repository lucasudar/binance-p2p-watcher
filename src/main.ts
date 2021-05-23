import * as inquirer from "inquirer";
import * as chalk from "chalk";
import axios, { AxiosError, AxiosResponse } from "axios";
import * as R from "ramda";
// @ts-expect-error
import * as Table from "cli-table";
import * as logUpdate from "log-update";

const DELAY_SECONDS = 3000;
const P2P_ENDPOINT = "https://p2p.binance.com";
const P2P_ROW_REQUEST = 20;
const DEFAULT_CRYPTO = "USDT";
const DEFAULT_FIAT = "THB";
const DEFAULT_TRADE_TYPE = "Buy";

import {
  IPSPRequestOption,
  Crypto,
  Fiat,
  TradeType,
  IP2PResponse,
  IOrder,
} from "./p2p";
const log = console.log;

function askCryptoQuestion(list: Crypto[]): inquirer.ListQuestionOptions {
  const defaultCrypto = DEFAULT_CRYPTO || "USDT";
  return {
    type: "list",
    name: "crypto",
    message: `Select crypto (default '${defaultCrypto}')`,
    choices: list,
    default: defaultCrypto,
  };
}

function askFiatQuestion(list: Fiat[]): inquirer.ListQuestionOptions {
  const defaultFiat = DEFAULT_FIAT || "THB";
  return {
    type: "list",
    name: "fiat",
    message: `Select fiat (default '${defaultFiat}')`,
    choices: list,
    default: defaultFiat,
  };
}

function askTradeTypeQuestion(list: TradeType[]): inquirer.ListQuestionOptions {
  const defaultTradeType = DEFAULT_TRADE_TYPE || "Buy";
  return {
    type: "list",
    name: "tradeType",
    message: `Select exchange type (default: '${defaultTradeType}')`,
    choices: list,
    default: defaultTradeType || "Buy",
  };
}

function askTransAmountQuestion(): inquirer.ListQuestionOptions {
  return {
    type: "input",
    name: "transAmount",
    message: "Enter Amount",
  };
}

interface IAskResponse {
  crypto: Crypto;
  fiat: Fiat;
  tradeType: TradeType;
  transAmount: string;
}

async function askQuestion(): Promise<IAskResponse> {
  const crytoList: Crypto[] = ["USDT", "BTC", "BNB", "BUSD", "ETH", "DAI"];
  const askCrypto = askCryptoQuestion(crytoList);

  const fiatList: Fiat[] = [
    "ARS",
    "EUR",
    "USD",
    "AED",
    "AUD",
    "BDT",
    "BHD",
    "BOB",
    "BRL",
    "CAD",
    "CLP",
    "CNY",
    "COP",
    "CRC",
    "CZK",
    "DOP",
    "DZD",
    "EGP",
    "GBP",
    "GEL",
    "GHS",
    "HKD",
    "IDR",
    "INR",
    "JPY",
    "KES",
    "KHR",
    "KRW",
    "KWD",
    "KZT",
    "LAK",
    "LBP",
    "LKR",
    "MAD",
    "MMK",
    "MXN",
    "MYR",
    "NGN",
    "OMR",
    "PAB",
    "PEN",
    "PHP",
    "PKR",
    "PLN",
    "PYG",
    "QAR",
    "RON",
    "RUB",
    "SAR",
    "SDG",
    "SEK",
    "SGD",
    "THB",
    "TND",
    "TRY",
    "TWD",
    "UAH",
    "UGX",
    "UYU",
    "VES",
    "VND",
    "ZAR",
  ];
  const askFiat = askFiatQuestion(fiatList);

  const tradeTypeList: TradeType[] = ["Buy", "Sell"];
  const askTradeType = askTradeTypeQuestion(tradeTypeList);

  const askTransAmount = askTransAmountQuestion();

  const askList = [askCrypto, askFiat, askTradeType, askTransAmount];

  return inquirer.prompt<IAskResponse>(askList);
}

async function requestBinanceP2P(
  requestOptions: IPSPRequestOption
): Promise<IP2PResponse> {
  const url = `${P2P_ENDPOINT}/bapi/c2c/v2/friendly/c2c/adv/search`;

  const headers = {
    "Cache-Control": "no-cache",
    "Content-Type": "application/json",
  };

  const response = await axios.post<
    IPSPRequestOption,
    AxiosResponse<IP2PResponse>
  >(url, requestOptions, {
    headers,
  });
  return response.data;
}

async function requestP2P(options: IPSPRequestOption): Promise<IP2PResponse> {
  try {
    const p2pResponse = await requestBinanceP2P(options);
    return p2pResponse;
  } catch (error) {
    if (error && error.response) {
      const axiosError = error as AxiosError<IP2PResponse>;
      return axiosError.response.data;
    }

    throw error;
  }
}

function prepareP2POption(answers: IAskResponse): IPSPRequestOption {
  const options: IPSPRequestOption = {
    page: 1,
    rows: P2P_ROW_REQUEST || 10,
    asset: answers.crypto,
    tradeType: answers.tradeType,
    fiat: answers.fiat,
    transAmount: answers.transAmount,
  };
  return options;
}

function sortOrder(orders: IOrder[]): IOrder[] {
  const sortWith = R.sortWith([
    R.ascend(R.path(["adv", "price"])),
    R.descend(R.path(["advertiser", "monthFinishRate"])),
  ]);

  return sortWith(orders);
}

function sortOrderMinPrice(orders: IOrder[]): IOrder[] {
  const sortMinPrice = R.sortWith([R.ascend(R.path(["adv", "price"]))]);
  const sorted = sortMinPrice(orders);
  return sorted;
}

function mapColor(orders: IOrder[]): Record<string, { color: string }> {
  const minPriceColorMapped: Record<string, { color: string }> = {};

  let colorCounter = 0;
  for (let index = 0; index < orders.length; index++) {
    const order: IOrder = orders[index];
    if (!minPriceColorMapped[order.adv.price]) {
      minPriceColorMapped[order.adv.price] = {
        color: Colors[RateMapper[colorCounter]] || Colors.normal,
      };
      colorCounter++;
    }
  }
  return minPriceColorMapped;
}

enum Colors {
  best = "#00ff00",
  good = "#ffff00",
  medium = "#ffbf00",
  normal = "#ffff",
}

const RateMapper = {
  0: "best",
  1: "good",
  2: "medium",
};

function formatThousands(number: number, fractionDigits: number = 0): string {
  const defaultLocale = undefined;
  const formatted = number.toLocaleString(defaultLocale, {
    minimumFractionDigits: fractionDigits,
  });
  return formatted;
}

function generateTable(orders: IOrder[]) {
  const table = new Table({
    chars: {
      top: "",
      "top-mid": "",
      "top-left": "",
      "top-right": "",
      bottom: "",
      "bottom-mid": "",
      "bottom-left": "",
      "bottom-right": "",
      left: "",
      "left-mid": "",
      mid: "",
      "mid-mid": "",
      right: "",
      "right-mid": "",
      middle: " ",
    },
    style: { "padding-left": 0, "padding-right": 0 },
    colWidths: [10, 8, 15, 8, 25, 95],
    colAligns: ["left", "right", "right", "right", "left", "left"],
    head: ["Success", "Price", "Available", "Order", "Name", "Link"],
  });

  const minPriceSorted = sortOrderMinPrice(orders);
  const minPriceColorMapped = mapColor(minPriceSorted);
  for (const order of orders) {
    const monthOrderCount = order.advertiser.monthOrderCount;
    const monthFinishRate = order.advertiser.monthFinishRate * 100;
    const nickName = order.advertiser.nickName;
    const price = order.adv.price;
    const advertiserNo = order.advertiser.userNo;
    const available = order.adv.surplusAmount;
    const monthFinishRatePercent = `${monthFinishRate.toFixed(2)}%`;

    table.push([
      monthFinishRate === 100
        ? chalk.hex(Colors.best)(monthFinishRatePercent)
        : monthFinishRatePercent,
      chalk.hex(minPriceColorMapped[price].color)(price),
      formatThousands(parseFloat(available), 2),
      formatThousands(monthOrderCount),
      nickName,
      `${P2P_ENDPOINT}/en/advertiserDetail?advertiserNo=${advertiserNo}`,
    ]);
  }

  return table;
}

function setIntervalImmediately(func: Function, interval: number) {
  func();
  return setInterval(func, interval);
}

(async () => {
  log(`💰  ${chalk.bold.underline(`P2P: BUY/SELL Questions\n`)}`);
  const answers = await askQuestion();

  log("\n");
  log(`P2P: ${chalk.bold.underline(P2P_ENDPOINT)} \n`);

  const run = async () => {
    const requestOptions = prepareP2POption(answers);
    const p2pResponse = await requestP2P(requestOptions);
    const orders = p2pResponse.data;
    const sorted = sortOrder(orders);
    const table = generateTable(sorted);

    logUpdate(`DATE: ${chalk.bold.underline(
      new Date().toLocaleString()
    )}  (refresh ${DELAY_SECONDS / 1000}s)

${table.toString()}

`);
  };

  setIntervalImmediately(run, DELAY_SECONDS);
})();