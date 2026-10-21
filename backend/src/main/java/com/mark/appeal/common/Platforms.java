package com.mark.appeal.common;

import java.util.Set;

public final class Platforms {
  private Platforms() {}

  public static final Set<String> ALL = Set.of("ins", "google", "tiktok", "ping0");

  public static String require(String value) {
    if (value == null || !ALL.contains(value)) throw ApiException.invalid("未知平台");
    return value;
  }
}
