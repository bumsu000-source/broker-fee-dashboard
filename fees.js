// Vercel 서버리스 함수: GET /api/fees
// 인증키는 Vercel 프로젝트의 환경변수(DATA_GO_KR_SERVICE_KEY)에서만 읽는다.
// .env 파일은 이 함수와 무관하며 배포물에도 포함되지 않는다(.vercelignore 참고).

const { fetchAllFees } = require("../lib/fetchFees");

module.exports = async (req, res) => {
  try {
    const data = await fetchAllFees(process.env.DATA_GO_KR_SERVICE_KEY);
    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
