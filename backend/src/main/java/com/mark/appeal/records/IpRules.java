package com.mark.appeal.records;

import com.google.common.net.InetAddresses;
import com.mark.appeal.common.ApiException;
import java.math.BigInteger;
import java.util.*;
import java.util.regex.Pattern;

public final class IpRules {
  public static final Set<String> STATUSES =
      Set.of("准备中", "已提交", "审核中", "部分完成", "申诉成功", "申诉失败", "需要补充", "已关闭");
  private static final Set<String> TERMINAL = Set.of("申诉成功", "申诉失败", "已关闭");
  private static final Pattern CREDENTIAL =
      Pattern.compile("^(\\d{1,3}(?:\\.\\d{1,3}){3}):(\\d{1,5}):([^:\\s]+):(.+)$");

  private IpRules() {}

  public static String status(String s) {
    if (s == null || !STATUSES.contains(s)) throw ApiException.invalid("未知申诉状态");
    return s;
  }

  public static String deriveStatus(String previous, boolean anyCompleted) {
    if (TERMINAL.contains(previous)) return previous;
    return anyCompleted ? "部分完成" : previous.equals("部分完成") ? "准备中" : previous;
  }

  public static boolean valid(String value) {
    if (value == null) return false;
    String[] parts = value.split("/", -1);
    if (parts.length > 2 || !InetAddresses.isInetAddress(parts[0]) || parts[0].contains("%"))
      return false;
    if (parts.length == 1) return true;
    if (!parts[1].matches("0|[1-9][0-9]{0,2}")) return false;
    int prefix = Integer.parseInt(parts[1]);
    return prefix <= (parts[0].contains(":") ? 128 : 32);
  }

  public static String normalize(String s) {
    s = s.trim();
    if (valid(s)) return s;
    if (s.matches("\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}")) {
      var octets = Arrays.stream(s.split("\\.")).map(Integer::parseInt).toList();
      if (octets.stream().allMatch(v -> v <= 255))
        return octets.get(0) + "." + octets.get(1) + "." + octets.get(2) + ".0/24";
    }
    throw ApiException.invalid("不是有效的 IP 或网段");
  }

  public static List<String> networks(String text, boolean shortAllowed) {
    var result = new LinkedHashSet<String>();
    int line = 0;
    for (String raw : text.split("\\R")) {
      line++;
      String s = raw.trim();
      if (s.isEmpty()) continue;
      if (shortAllowed) {
        try {
          s = normalize(s);
        } catch (ApiException e) {
          throw ApiException.invalid("第 " + line + " 行不是有效网段");
        }
      } else if (!valid(s)) throw ApiException.invalid("第 " + line + " 行不是有效 IP 或 CIDR");
      result.add(s);
    }
    if (result.isEmpty()) throw ApiException.invalid("IP不能为空");
    return List.copyOf(result);
  }

  private static byte[] address(String value) {
    byte[] bytes = InetAddresses.forString(value).getAddress();
    if (value.contains(":") && bytes.length == 4) {
      byte[] mapped = new byte[16];
      mapped[10] = (byte) 255;
      mapped[11] = (byte) 255;
      System.arraycopy(bytes, 0, mapped, 12, 4);
      return mapped;
    }
    return bytes;
  }

  public static boolean contains(String network, String ip) {
    if (!valid(network) || !valid(ip) || ip.contains("/")) return false;
    var parts = network.split("/");
    byte[] a = address(parts[0]), b = address(ip);
    if (a.length != b.length) return false;
    int shift = a.length * 8 - (parts.length == 1 ? a.length * 8 : Integer.parseInt(parts[1]));
    return new BigInteger(1, a).shiftRight(shift).equals(new BigInteger(1, b).shiftRight(shift));
  }

  public static void validateContent(String network, String content) {
    String s = content.trim(), ip = "";
    if (s.startsWith("[") && s.contains("]")) ip = s.substring(1, s.indexOf(']'));
    else {
      var m = Pattern.compile("^(\\d{1,3}(?:\\.\\d{1,3}){3})(?=$|[\\s:|,])").matcher(s);
      ip = m.find() ? m.group(1) : s.split("[\\s|,]+", 2)[0];
    }
    if (valid(ip) && !ip.contains("/") && !contains(network, ip))
      throw ApiException.invalid("验证 IP 不属于对应网段");
  }

  public record CredentialImport(
      Map<String, String> assignments,
      List<Integer> invalidLines,
      List<Integer> unmatchedLines,
      List<String> duplicateNetworks) {}

  public static CredentialImport importCredentials(List<String> networks, String text) {
    var assigned = new LinkedHashMap<String, String>();
    var invalid = new ArrayList<Integer>();
    var unmatched = new ArrayList<Integer>();
    var duplicates = new LinkedHashSet<String>();
    int n = 0;
    for (var raw : text.split("\\R")) {
      n++;
      String s = raw.trim().replaceAll("\\\\+\\s*$", "").trim();
      if (s.isEmpty()) continue;
      var m = CREDENTIAL.matcher(s);
      if (!m.matches()
          || !valid(m.group(1))
          || Integer.parseInt(m.group(2)) < 1
          || Integer.parseInt(m.group(2)) > 65535
          || m.group(4).trim().isEmpty()) {
        invalid.add(n);
        continue;
      }
      String network =
          networks.stream().filter(v -> contains(v, m.group(1))).findFirst().orElse(null);
      if (network == null) {
        unmatched.add(n);
        continue;
      }
      if (assigned.containsKey(network)) duplicates.add(network);
      assigned.put(
          network, m.group(1) + ":" + m.group(2) + ":" + m.group(3) + ":" + m.group(4).trim());
    }
    return new CredentialImport(assigned, invalid, unmatched, List.copyOf(duplicates));
  }
}
