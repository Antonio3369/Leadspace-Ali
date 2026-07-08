/** 解析 URL 多选参数（支持重复 key 或逗号分隔） */
export function parseMultiSearchParam(
  searchParams: URLSearchParams,
  key: string
): string[] | undefined {
  const values = searchParams
    .getAll(key)
    .flatMap((value) => value.split(",").map((part) => part.trim()).filter(Boolean));
  return values.length > 0 ? values : undefined;
}

/** 将多选值写入 URLSearchParams */
export function appendMultiSearchParam(
  params: URLSearchParams,
  key: string,
  values: string[]
) {
  for (const value of values) {
    params.append(key, value);
  }
}
