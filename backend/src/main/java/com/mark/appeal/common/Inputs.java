package com.mark.appeal.common;

import com.mark.appeal.domain.BaseEntity;
import java.time.OffsetDateTime;
import java.util.*;

public final class Inputs {
  public static String searchPattern(String value) {
    return "%"
        + value
            .toLowerCase(java.util.Locale.ROOT)
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
        + "%";
  }

  private Inputs() {}

  public static String text(Map<String, ?> input, String key) {
    Object value = input.get(key);
    if (value == null) return "";
    if (!(value instanceof String s)) throw ApiException.invalid(key + " 必须是字符串");
    return s.trim();
  }

  public static String required(Map<String, ?> input, String key) {
    String v = text(input, key);
    if (v.isEmpty()) throw ApiException.invalid(key + " 不能为空");
    return v;
  }

  public static boolean bool(Map<String, ?> input, String key, boolean fallback) {
    if (!input.containsKey(key)) return fallback;
    if (!(input.get(key) instanceof Boolean b)) throw ApiException.invalid(key + " 必须是布尔值");
    return b;
  }

  public static int integer(Map<String, ?> input, String key, int fallback) {
    if (!input.containsKey(key)) return fallback;
    if (!(input.get(key) instanceof Number n)
        || n.doubleValue() != n.intValue()
        || n.intValue() < 0) throw ApiException.invalid(key + " 必须是非负整数");
    return n.intValue();
  }

  public static void allowed(Map<String, ?> input, Set<String> keys) {
    if (input == null || !keys.containsAll(input.keySet()))
      throw ApiException.invalid("请求为空或包含不允许修改的字段");
  }

  public static OffsetDateTime date(String value) {
    try {
      return OffsetDateTime.parse(value);
    } catch (Exception e) {
      throw ApiException.invalid("时间必须包含时区，使用 ISO 8601 格式");
    }
  }

  public static void initialize(BaseEntity e, String platform) {
    e.setId(UUID.randomUUID().toString());
    e.setPlatformId(Platforms.require(platform));
    e.setCreatedAt(OffsetDateTime.now());
    e.setUpdatedAt(e.getCreatedAt());
  }

  public static List<String> ids(List<String> values) {
    if (values == null
        || values.isEmpty()
        || values.stream().anyMatch(v -> v == null || v.isBlank()))
      throw ApiException.invalid("请选择记录");
    return values.stream().distinct().toList();
  }

  public static void page(long page, long size) {
    if (page < 1 || size < 1 || size > 100 || page > Integer.MAX_VALUE)
      throw ApiException.invalid("分页参数不正确");
  }
}
