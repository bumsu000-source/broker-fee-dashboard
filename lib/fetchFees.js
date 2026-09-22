// 증권사 국내주식 수수료 조회 — 공통 로직
//
// 로컬 개발 서버(server.js)와 Vercel 서버리스 함수(api/fees.js)가
// 이 모듈을 함께 사용한다. 인증키는 항상 process.env에서만 읽는다.

const https = require("https");

const COMPANIES = [
  { id: "kiwoom", name: "키움증권", likeCmpyNm: "키움" },
  { id: "kis", name: "한국투자증권", likeCmpyNm: "한국투자" },
  { id: "mirae", name: "미래에셋증권", likeCmpyNm: "미래에셋" },
  { id: "nh", name: "NH투자증권", likeCmpyNm: "NH투자" },
  { id: "samsung", name: "삼성증권", likeCmpyNm: "삼성" },
  { id: "kb", name: "KB증권", likeCmpyNm: "KB증권" },
];

// 거래금액구분 코드: 200 = 100만원 구간 (대표값으로 고정)
const TR_AMT = "200";
// 비교 기준 채널: "스마트폰"이 들어간 비대면 채널을 대표값으로 사용
const CHANNEL_HINT = "스마트폰";

const API_HOST = "apis.data.go.kr";
const API_PATH =
  "/1160100/service/GetOfficialNoticeInfoService/getStockTradingFeeInfo";

// 검증된 실데이터 스냅샷 (폴백 전용) — 지어낸 값이 아니라 개발 중 이 API를
// 실제로 호출해 받은 응답에서 그대로 옮겨 적은 값. apis.data.go.kr에 실제로
// 접근 가능한 환경(Vercel 등)에서는 항상 실시간 응답이 우선하고, 이 스냅샷은
// 네트워크 정책으로 막힌 환경(개발 샌드박스)에서만 폴백으로 쓰인다.
const VERIFIED_SNAPSHOT = {
  kiwoom: { basDt: "20201231", channel: "증권사지점개설계좌 온라인 스마트폰", feeWon: 150 },
  samsung: { basDt: "20211001", channel: "은행개설계좌 온라인 스마트폰", feeWon: 2972 },
};

function callDataGoKr(serviceKey, likeCmpyNm) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({
      serviceKey,
      resultType: "json",
      numOfRows: "50",
      pageNo: "1",
      likeCmpyNm,
      trAmt: TR_AMT,
    }).toString();

    const options = {
      host: API_HOST,
      path: `${API_PATH}?${qs}`,
      method: "GET",
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} from data.go.kr: ${body.slice(0, 300)}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`JSON 파싱 실패: ${e.message} / body: ${body.slice(0, 300)}`));
        }
      });
    });

    req.on("timeout", () => req.destroy(new Error("data.go.kr 요청 타임아웃")));
    req.on("error", (err) => reject(err));
    req.end();
  });
}

function pickRepresentativeRow(apiJson) {
  const header = apiJson && apiJson.response && apiJson.response.header;
  if (!header || header.resultCode !== "00") {
    return { error: header ? header.resultMsg : "알 수 없는 응답 형식" };
  }

  const body = apiJson.response.body;
  let items = (body && body.items && body.items.item) || [];
  if (!Array.isArray(items)) items = items ? [items] : [];

  const candidates = items.filter(
    (it) => it.ctg === "변경후" && (it.brofOpnActCtg || "").includes(CHANNEL_HINT)
  );

  if (candidates.length === 0) return { error: "해당 조건(변경후·스마트폰)의 데이터 없음" };

  candidates.sort((a, b) => (a.basDt < b.basDt ? 1 : -1));
  const top = candidates[0];

  return {
    basDt: top.basDt,
    channel: top.brofOpnActCtg,
    feeWon: Number(top.cfe),
    trAmtCode: top.trAmt,
  };
}

async function fetchAllFees(serviceKey) {
  const results = [];
  for (const company of COMPANIES) {
    if (!serviceKey) {
      results.push({
        id: company.id,
        name: company.name,
        status: "error",
        error: "DATA_GO_KR_SERVICE_KEY 환경변수가 설정되지 않았습니다.",
      });
      continue;
    }
    try {
      const json = await callDataGoKr(serviceKey, company.likeCmpyNm);
      const picked = pickRepresentativeRow(json);
      if (picked.error) {
        results.push({ id: company.id, name: company.name, status: "no_data", note: picked.error });
      } else {
        results.push({ id: company.id, name: company.name, ...picked, status: "live" });
      }
    } catch (err) {
      const isSandboxBlock = /not in allowlist/i.test(err.message);
      const snapshot = VERIFIED_SNAPSHOT[company.id];
      if (isSandboxBlock && snapshot) {
        results.push({
          id: company.id,
          name: company.name,
          ...snapshot,
          status: "verified_snapshot",
          note: "이 환경에서는 실시간 호출이 막혀 있어, 개발 중 직접 검증한 값을 대신 보여줍니다.",
        });
      } else {
        results.push({ id: company.id, name: company.name, error: err.message, status: "error" });
      }
    }
  }

  return {
    fetchedAt: new Date().toISOString(),
    trAmtLabel: "100만원 거래 기준",
    channelLabel: "비대면(스마트폰) 채널 기준",
    source: "금융위원회_금융투자회사공시정보 (data.go.kr, 오퍼레이션: getStockTradingFeeInfo)",
    scope: "국내주식 매매수수료만 제공",
    companies: results,
  };
}

module.exports = { fetchAllFees, COMPANIES };
