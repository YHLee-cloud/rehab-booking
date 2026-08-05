// 是否啟用內建 HTTPS（自簽憑證）。
// 可用環境變數 HTTPS=true / HTTPS=false 明確指定；未指定時，
// 獨立執行檔（pkg 打包版，供 Windows 電腦安裝使用）預設開啟，
// 一般以原始碼執行（npm start / 雲端平台部署）預設關閉，與過去行為一致。
const HTTPS_ENABLED =
  process.env.HTTPS !== undefined ? String(process.env.HTTPS).toLowerCase() === 'true' : !!process.pkg;

module.exports = { HTTPS_ENABLED };
