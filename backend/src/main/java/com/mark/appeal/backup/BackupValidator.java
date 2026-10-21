package com.mark.appeal.backup;

import com.mark.appeal.common.*;
import com.mark.appeal.domain.*;
import com.mark.appeal.evidence.ImageContent;
import com.mark.appeal.records.IpRules;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

@Component
public class BackupValidator {
  public static final int MAX_BYTES = 100 * 1024 * 1024;
  private final JsonMapper json;

  public BackupValidator(JsonMapper json) {
    this.json = json;
  }

  public record RecordData(
      AppealRecord record,
      List<String> networks,
      Set<String> completed,
      Map<String, Map<String, Object>> credentials) {}

  public record ImageData(
      String id,
      String platform,
      String recordId,
      String fileName,
      String mime,
      byte[] bytes,
      OffsetDateTime createdAt) {}

  public record Prepared(
      List<Account> accounts,
      List<AppealModule> modules,
      List<AppealStep> steps,
      List<RecordData> records,
      List<ImageData> images) {}

  @SuppressWarnings("unchecked")
  private static Map<String, Object> object(Object value) {
    if (!(value instanceof Map<?, ?>)) throw ApiException.invalid("备份应包含 JSON 对象");
    return (Map<String, Object>) value;
  }

  private static List<Map<String, Object>> rows(Map<String, Object> data, String key) {
    if (!(data.get(key) instanceof List<?> list)) throw ApiException.invalid("备份缺少数组 " + key);
    return list.stream().map(BackupValidator::object).toList();
  }

  private static void strings(Map<String, Object> row, String... keys) {
    for (String key : keys)
      if (!(row.get(key) instanceof String)) throw ApiException.invalid("备份缺少字符串字段 " + key);
  }

  private static Map<String, Object> base(Map<String, Object> source, Set<String> fields) {
    strings(source, "id", "platformId", "createdAt", "updatedAt");
    if (((String) source.get("id")).isBlank()) throw ApiException.invalid("备份 ID 为空");
    Platforms.require((String) source.get("platformId"));
    Inputs.date((String) source.get("createdAt"));
    Inputs.date((String) source.get("updatedAt"));
    Inputs.bool(source, "archived", false);
    if (!source.containsKey("archived")) throw ApiException.invalid("备份缺少 archived");
    var out = new LinkedHashMap<String, Object>();
    for (String k : List.of("id", "platformId", "createdAt", "updatedAt", "archived"))
      out.put(k, source.get(k));
    for (String k : fields) if (source.containsKey(k)) out.put(k, source.get(k));
    return out;
  }

  private static <T extends BaseEntity> Map<String, T> index(List<T> values) {
    var result = new HashMap<String, T>();
    for (T item : values)
      if (result.put(item.getId(), item) != null) throw ApiException.invalid("备份存在重复 ID");
    return result;
  }

  private static void relation(
      String platform, String id, Map<String, ? extends BaseEntity> parents) {
    if (id != null
        && (id.isEmpty()
            || !parents.containsKey(id)
            || !parents.get(id).getPlatformId().equals(platform)))
      throw ApiException.invalid("备份存在跨平台或悬空关联");
  }

  public Prepared parse(byte[] bytes) {
    if (bytes.length > MAX_BYTES) throw new ApiException(413, "PAYLOAD_TOO_LARGE", "备份最多 100 MiB");
    try {
      return validate(object(json.readValue(bytes, Map.class)));
    } catch (ApiException e) {
      throw e;
    } catch (Exception e) {
      throw ApiException.invalid("备份格式或字段值不正确");
    }
  }

  private Prepared validate(Map<String, Object> root) {
    if (!"platform-appeal-manager-backup".equals(root.get("format"))
        || !(root.get("version") instanceof Number n)
        || !(n.intValue() == 1 || n.intValue() == 2)
        || n.doubleValue() != n.intValue()) throw ApiException.invalid("不支持的备份格式或版本");
    Inputs.date(Inputs.required(root, "exportedAt"));
    var data = object(root.get("data"));
    var accounts = new ArrayList<Account>();
    for (var row : rows(data, "accounts")) {
      strings(
          row,
          "country",
          "account",
          "password",
          "emailAccount",
          "emailPassword",
          "twoFactor",
          "note");
      var v = base(row, AccountFields.ALL);
      v.put("legacyArchived", v.remove("archived"));
      for (String k : List.of("token", "decodeLink")) {
        if (!v.containsKey(k)) v.put(k, "");
        strings(v, k);
      }
      v.put("used", Inputs.bool(row, "used", false));
      accounts.add(json.convertValue(v, Account.class));
    }
    var modules = new ArrayList<AppealModule>();
    for (var row : rows(data, "appealModules")) {
      strings(row, "name", "description", "note");
      Inputs.required(row, "name");
      if (!row.containsKey("enabled") || !row.containsKey("sortOrder"))
        throw ApiException.invalid("模块缺少字段");
      Inputs.bool(row, "enabled", true);
      Inputs.integer(row, "sortOrder", 0);
      modules.add(
          json.convertValue(
              base(row, Set.of("name", "description", "note", "enabled", "sortOrder")),
              AppealModule.class));
    }
    var steps = new ArrayList<AppealStep>();
    for (var row : rows(data, "appealSteps")) {
      strings(row, "moduleId", "name", "instructions", "note");
      Inputs.required(row, "name");
      Inputs.required(row, "instructions");
      if (!row.containsKey("sortOrder")) throw ApiException.invalid("步骤缺少排序字段");
      Inputs.integer(row, "sortOrder", 0);
      steps.add(
          json.convertValue(
              base(row, Set.of("moduleId", "name", "instructions", "note", "sortOrder")),
              AppealStep.class));
    }
    var records = new ArrayList<RecordData>();
    for (var row : rows(data, "appealRecords")) {
      strings(
          row,
          "status",
          "country",
          "ip",
          "appealedAt",
          "appealPlatform",
          "note",
          "template1",
          "template2");
      IpRules.status(Inputs.required(row, "status"));
      Inputs.required(row, "country");
      Inputs.required(row, "appealPlatform");
      Inputs.date(Inputs.required(row, "appealedAt"));
      for (String k : List.of("accountId", "moduleId", "stepId"))
        if (row.containsKey(k)) Inputs.required(row, k);
      var r =
          json.convertValue(
              base(
                  row,
                  Set.of(
                      "status",
                      "country",
                      "appealedAt",
                      "appealPlatform",
                      "accountId",
                      "moduleId",
                      "stepId",
                      "note",
                      "template1",
                      "template2")),
              AppealRecord.class);
      var nets = IpRules.networks((String) row.get("ip"), false);
      var completed = new LinkedHashSet<String>();
      if (row.containsKey("completedIps")) {
        if (!(row.get("completedIps") instanceof List<?> list))
          throw ApiException.invalid("completedIps 应为数组");
        for (Object value : list) {
          if (!(value instanceof String s)) throw ApiException.invalid("完成 IP 格式错误");
          else if (nets.contains(s)) completed.add(s);
        }
      }
      var credentials = new LinkedHashMap<String, Map<String, Object>>();
      if (row.containsKey("verificationIps")) {
        for (var c : rows(row, "verificationIps")) {
          String net = Inputs.required(c, "network");
          if (!IpRules.valid(net)) throw ApiException.invalid("验证网段无效");
          var kept = new LinkedHashMap<String, Object>();
          for (String k : List.of("ip", "account", "password")) kept.put(k, Inputs.text(c, k));
          if (c.containsKey("content")) {
            strings(c, "content");
            kept.put("content", Inputs.text(c, "content"));
            IpRules.validateContent(net, (String) kept.get("content"));
          }
          String ip = (String) kept.get("ip");
          if (!ip.isEmpty()
              && (!IpRules.valid(ip) || ip.contains("/") || !IpRules.contains(net, ip)))
            throw ApiException.invalid("旧验证 IP 不属于网段");
          if (nets.contains(net) && kept.values().stream().anyMatch(v -> !v.toString().isEmpty()))
            credentials.put(net, kept);
        }
      }
      records.add(new RecordData(r, nets, completed, credentials));
    }
    var ai = index(accounts);
    var mi = index(modules);
    var si = index(steps);
    var ri = index(records.stream().map(RecordData::record).toList());
    for (var s : steps) relation(s.getPlatformId(), s.getModuleId(), mi);
    for (var r : ri.values()) {
      relation(r.getPlatformId(), r.getAccountId(), ai);
      relation(r.getPlatformId(), r.getModuleId(), mi);
      relation(r.getPlatformId(), r.getStepId(), si);
      if (r.getStepId() != null
          && !Objects.equals(si.get(r.getStepId()).getModuleId(), r.getModuleId()))
        throw ApiException.invalid("步骤和模块不匹配");
    }
    var images = new ArrayList<ImageData>();
    var ids = new HashSet<String>();
    var counts = new HashMap<String, Integer>();
    if (((Number) root.get("version")).intValue() == 2)
      for (var image : rows(data, "evidenceImages")) {
        String id = Inputs.required(image, "id"),
            p = Inputs.required(image, "platformId"),
            rid = Inputs.required(image, "recordId");
        if (!ids.add(id)) throw ApiException.invalid("图片 ID 重复");
        relation(p, rid, ri);
        if (counts.merge(rid, 1, Integer::sum) > 10) throw ApiException.invalid("每条记录最多十张图片");
        String mime = Inputs.required(image, "mimeType"),
            encoded = Inputs.required(image, "data"),
            prefix = "data:" + mime + ";base64,";
        if (!encoded.startsWith(prefix)) throw ApiException.invalid("图片 data URL 类型不匹配");
        byte[] content = Base64.getDecoder().decode(encoded.substring(prefix.length()));
        ImageContent.validate(content, mime);
        if (Inputs.integer(image, "size", -1) != content.length)
          throw ApiException.invalid("图片大小不一致");
        images.add(
            new ImageData(
                id,
                p,
                rid,
                Inputs.required(image, "fileName"),
                mime,
                content,
                Inputs.date(Inputs.required(image, "createdAt"))));
      }
    return new Prepared(accounts, modules, steps, records, images);
  }

  private static class AccountFields {
    static final Set<String> ALL =
        Set.of(
            "country",
            "account",
            "password",
            "emailAccount",
            "emailPassword",
            "twoFactor",
            "note",
            "used",
            "token",
            "decodeLink");
  }
}
