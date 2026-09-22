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
