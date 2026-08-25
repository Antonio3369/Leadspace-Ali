/**
 * URLSearchParams.toString() 默认不编码 `*`。
 * 小绿盒 SN 都带 *，写进 ?q= 会被 Next/浏览器当通配符截断，商户名能搜到、SN 搜不到。
 */
export function searchParamsToQueryString(params: URLSearchParams): string {
  return params.toString().replace(/\*/g, "%2A");
}
