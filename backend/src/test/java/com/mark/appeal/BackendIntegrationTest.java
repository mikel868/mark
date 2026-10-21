package com.mark.appeal;

import static org.assertj.core.api.Assertions.*;

import com.mark.appeal.accounts.AccountService;
import com.mark.appeal.backup.*;
import com.mark.appeal.common.ApiException;
import com.mark.appeal.evidence.*;
import com.mark.appeal.maintenance.WorkspaceWriteGuard;
import com.mark.appeal.records.RecordService;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class BackendIntegrationTest {
  static final String PASSWORD = "test-only-password";
  static final String HASH =
      PasswordEncoderFactories.createDelegatingPasswordEncoder().encode(PASSWORD);
  static PostgreSQLContainer<?> container;

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry r) {
    String url = System.getenv("TEST_DB_URL");
    if (url == null) {
      container = new PostgreSQLContainer<>("postgres:17.6-alpine");
      container.start();
      r.add("spring.datasource.url", container::getJdbcUrl);
      r.add("spring.datasource.username", container::getUsername);
      r.add("spring.datasource.password", container::getPassword);
    } else {
      if (!url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/[a-z_]+_test"))
        throw new IllegalArgumentException("Use an isolated loopback database ending in _test");
      r.add("spring.datasource.url", () -> url);
      r.add(
          "spring.datasource.username",
          () -> System.getenv().getOrDefault("TEST_DB_USERNAME", "appeal_test"));
      r.add(
          "spring.datasource.password", () -> System.getenv().getOrDefault("TEST_DB_PASSWORD", ""));
    }
    r.add("spring.flyway.placeholders.adminUsername", () -> "test-admin");
    r.add("spring.flyway.placeholders.readonlyUsername", () -> "test-reader");
    r.add("spring.flyway.placeholders.adminPasswordHash", () -> HASH);
    r.add("spring.flyway.placeholders.readonlyPasswordHash", () -> HASH);
    r.add("app.secure-cookie", () -> false);
  }

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;
  @Autowired JsonMapper json;
  @Autowired RecordService records;
  @Autowired AccountService accounts;
  @Autowired com.mark.appeal.flow.FlowService flows;
  @Autowired EvidenceService images;
  @Autowired BackupService backups;
  @Autowired BackupValidator validator;
  @Autowired RestoreTransactionService restores;
  @Autowired WorkspaceWriteGuard guard;
  @Autowired PlatformTransactionManager transactionManager;

  @BeforeEach
  void clearBusiness() {
    jdbc.execute(
        "truncate record_evidence_images,appeal_record_ips,appeal_records,appeal_steps,appeal_modules,accounts,backup_restore_runs,spring_session cascade");
  }

  @AfterAll
  static void stopContainer() {
    if (container != null) container.stop();
  }

  @Test
  void frontendFiltersAndSummaryCoverTheWholePlatform() throws Exception {
    var imported =
        accounts.importAccounts(
            "ins",
            List.of(
                Map.of(
                    "account",
                    "search-demo",
                    "country",
                    "US",
                    "emailAccount",
                    "unique@example.test")));
    String accountId = jdbc.queryForObject("select id from accounts limit 1", String.class);
    var record = newRecord("203.0.113.0/24");
    records.patch(
        "ins", record.get("id").toString(), Map.of("accountId", accountId, "status", "部分完成"));
    var client = new Client();
    client.login("test-admin");
    assertThat(
            map(client
                    .json(
                        "GET", "/api/v1/platforms/ins/accounts?search=unique%40example.test", null)
                    .body())
                .get("total"))
        .isEqualTo(1);
    assertThat(
            map(client
                    .json("GET", "/api/v1/platforms/ins/appeal-records?search=not-found", null)
                    .body())
                .get("total"))
        .isEqualTo(0);
    assertThat(
            map(client
                    .json(
                        "GET",
                        "/api/v1/platforms/ins/appeal-records?search=search-demo&statusGroup=complete",
                        null)
                    .body())
                .get("total"))
        .isEqualTo(1);
    assertThat(
            map(client
                    .json(
                        "GET", "/api/v1/platforms/ins/appeal-records?statusGroup=processing", null)
                    .body())
                .get("total"))
        .isEqualTo(0);
    assertThat(
            map(client
                    .json("GET", "/api/v1/platforms/ins/appeal-records?moduleId=missing", null)
                    .body())
                .get("total"))
        .isEqualTo(0);
    var options =
        map(client.json("GET", "/api/v1/platforms/ins/accounts/options?country=US", null).body());
    assertThat(options.toString()).contains("appealCount=1");
    assertThat(
            map(client
                    .json("GET", "/api/v1/platforms/ins/accounts/options?country=JP", null)
                    .body())
                .get("total"))
        .isEqualTo(0);
    var counts = map(client.json("GET", "/api/v1/platforms/ins/summary", null).body());
    assertThat(counts).containsKeys("modules", "steps", "images");
  }

  class Client {
    final HttpClient http =
        HttpClient.newBuilder()
            .cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL))
            .build();
    String csrf;

    HttpResponse<String> request(
        String method, String path, String body, boolean token, String type) throws Exception {
      var builder =
          HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
              .header("Content-Type", type)
              .method(
                  method,
                  body == null
                      ? HttpRequest.BodyPublishers.noBody()
                      : HttpRequest.BodyPublishers.ofString(body));
      if (token) builder.header("X-CSRF-TOKEN", csrf);
      return http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    void csrf() throws Exception {
      csrf =
          map(request("GET", "/api/v1/auth/csrf", null, false, "application/json").body())
              .get("token")
              .toString();
    }

    void login(String username) throws Exception {
      csrf();
      var response =
          request(
              "POST",
              "/api/v1/auth/login",
              "username=" + username + "&password=" + PASSWORD,
              true,
              "application/x-www-form-urlencoded");
      assertThat(response.statusCode()).isEqualTo(200);
      csrf();
    }

    HttpResponse<String> json(String method, String path, Object body) throws Exception {
      return request(
          method,
          path,
          body == null ? null : json.writeValueAsString(body),
          true,
          "application/json");
    }
  }

  @SuppressWarnings("unchecked")
  Map<String, Object> map(String body) {
    return json.readValue(body, Map.class);
  }

  Map<String, Object> newRecord(String ip) {
    return records.create(
        "ins",
        Map.of(
            "country",
            "美国",
            "status",
            "准备中",
            "ip",
            ip,
            "appealedAt",
            "2026-10-10T00:00:00Z",
            "appealPlatform",
            "ins"));
  }

  @SuppressWarnings("unchecked")
  String ipId(Map<String, Object> record, int position) {
    return ((List<Map<String, Object>>) record.get("ipItems")).get(position).get("id").toString();
  }

  @Test
  void flywayCreatesExactlyTwoUsersAndIndexes() {
    assertThat(jdbc.queryForObject("select count(*) from app_users", Long.class)).isEqualTo(2);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from flyway_schema_history where success", Long.class))
        .isEqualTo(4);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from pg_indexes where indexname='idx_records_platform_status_created'",
                Long.class))
        .isEqualTo(1);
  }

  @Test
  void cookieSessionsCsrfRolesAndCurrentSessionLogout() throws Exception {
    var a = new Client();
    var b = new Client();
    var reader = new Client();
    a.login("test-admin");
    b.login("test-admin");
    reader.login("test-reader");
    assertThat(
            jdbc.queryForObject(
                "select count(*) from spring_session where principal_name is not null", Long.class))
        .isEqualTo(3);
    assertThat(
            jdbc.queryForObject(
                "select max(max_inactive_interval) from spring_session", Integer.class))
        .isEqualTo(28800);
    assertThat(reader.json("GET", "/api/v1/backups/export", null).statusCode()).isEqualTo(200);
    assertThat(reader.json("POST", "/api/v1/platforms/ins/accounts", Map.of()).statusCode())
        .isEqualTo(403);
    assertThat(
            a.request(
                    "POST",
                    "/api/v1/platforms/ins/accounts/import",
                    "{\"rows\":[{}]}",
                    false,
                    "application/json")
                .statusCode())
        .isEqualTo(403);
    assertThat(a.json("POST", "/api/v1/auth/logout", null).statusCode()).isEqualTo(204);
    assertThat(a.request("GET", "/api/v1/auth/me", null, false, "application/json").statusCode())
        .isEqualTo(401);
    assertThat(b.json("GET", "/api/v1/auth/me", null).statusCode()).isEqualTo(200);
  }

  @Test
  void importDuplicatesAndPhysicalDeleteKeepHistory() {
    var imported =
        accounts.importAccounts(
            "ins", List.of(Map.of("account", "same"), Map.of("account", "same")));
    assertThat(imported.get("count")).isEqualTo(2);
    assertThat((List<?>) imported.get("warnings")).hasSize(2);
    String id = ((List<?>) imported.get("ids")).getFirst().toString();
    var r = newRecord("194.179.156.0/24");
    String rid = r.get("id").toString();
    records.patch("ins", rid, Map.of("accountId", id));
    accounts.delete("ins", id);
    assertThat(records.get("ins", rid))
        .doesNotContainKey("accountId")
        .containsEntry("ip", "194.179.156.0/24");
  }

  @Test
  void batchRollsBackAndLastWriteWinsWithoutChangingIpChecks() {
    var a = newRecord("198.65.111.0/24");
    var b = newRecord("198.65.112.0/24");
    String aid = a.get("id").toString(), bid = b.get("id").toString();
    records.completed("ins", aid, ipId(a, 0), true);
    assertThatThrownBy(() -> records.batchStatus("ins", List.of(aid, "missing"), "已提交"))
        .isInstanceOf(ApiException.class);
    assertThat(records.entity("ins", aid).getStatus()).isEqualTo("部分完成");
    records.batchStatus("ins", List.of(aid, bid), "已提交");
    records.batchStatus("ins", List.of(aid, bid), "审核中");
    assertThat(records.entity("ins", aid).getStatus()).isEqualTo("审核中");
    assertThat((List<?>) records.get("ins", aid).get("completedIps")).hasSize(1);
    assertThat(records.batchStatus("ins", List.of(aid, aid), "审核中")).isEqualTo(1);
  }

  @Test
  void crossPlatformAndMissingStepModuleAreRejected() {
    var r = newRecord("198.65.111.0/24");
    String id = r.get("id").toString();
    var imported = accounts.importAccounts("google", List.of(Map.of("account", "foreign")));
    String aid = ((List<?>) imported.get("ids")).getFirst().toString();
    assertThatThrownBy(() -> records.patch("ins", id, Map.of("accountId", aid)))
        .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    assertThatThrownBy(() -> records.patch("ins", id, Map.of("stepId", "no-module")))
        .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    assertThat(records.get("ins", id)).doesNotContainKey("accountId").doesNotContainKey("stepId");
  }

  @Test
  void quickImportCredentialsUpdateEveryMatchingRecordAndPreserveOtherNetworks() {
    var a = newRecord("198.65.111.0/24\n198.65.112.0/24");
    var b = newRecord("198.65.111.0/24");
    String aid = a.get("id").toString(), bid = b.get("id").toString();
    records.credentials(
        "ins", aid, List.of(new RecordService.CredentialEdit(ipId(a, 1), "partial text")));
    var result =
        records.importCredentials(
            "ins", null, "198.65.111.37:1234:u:p\\\n198.65.111.38:1234:u:last");
    assertThat(result.get("updatedCount")).isEqualTo(2);
    assertThat(json.writeValueAsString(records.get("ins", aid)))
        .contains("partial text", "198.65.111.38:1234:u:last");
    assertThat(json.writeValueAsString(records.get("ins", bid)))
        .contains("198.65.111.38:1234:u:last");
    assertThat(
            records.quickImport("ins", "美国", "209.166.41\n64.32.179\n204.237.146", 1).get("count"))
        .isEqualTo(3);
  }

  byte[] png() throws Exception {
    var out = new ByteArrayOutputStream();
    ImageIO.write(new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB), "png", out);
    return out.toByteArray();
  }

  @Test
  void imagesAndV2BackupRoundTripWithoutHashFieldAndRestoreIsIdempotent() throws Exception {
    var r = newRecord("198.65.111.0/24");
    String id = r.get("id").toString();
    var bytes = png();
    images.upload(
        "ins", id, List.of(new MockMultipartFile("files", "proof.png", "image/png", bytes)));
    records.completed("ins", id, ipId(r, 0), true);
    var file = backups.export();
    byte[] backup;
    try {
      backup = Files.readAllBytes(file);
    } finally {
      Files.delete(file);
    }
    assertThat(new String(backup, StandardCharsets.UTF_8)).doesNotContain("sha256");
    var prepared = validator.parse(backup);
    accounts.importAccounts("ins", List.of(Map.of()));
    var first =
        restores.restore("restore-1", ImageContent.sha256(backup), "initial-admin", prepared);
    assertThat(accounts.list("ins", 1, 10, null, null, null).total()).isZero();
    assertThat(images.get("ins", id, images.list("ins", id).getFirst().id()).bytes())
        .isEqualTo(bytes);
    accounts.importAccounts("ins", List.of(Map.of()));
    assertThat(
            restores.restore("restore-1", ImageContent.sha256(backup), "initial-admin", prepared))
        .isEqualTo(first);
    assertThat(accounts.list("ins", 1, 10, null, null, null).total()).isEqualTo(1);
    assertThatThrownBy(() -> restores.restore("restore-1", "different", "initial-admin", prepared))
        .isInstanceOf(ApiException.class);
    assertThat(jdbc.queryForObject("select count(*) from app_users", Long.class)).isEqualTo(2);
  }

  @Test
  void corruptedBackupAndFailedDatabaseRestoreDoNotEraseData() throws Exception {
    String id = newRecord("198.65.111.0/24").get("id").toString();
    assertThatThrownBy(() -> validator.parse("{}".getBytes(StandardCharsets.UTF_8)))
        .isInstanceOf(ApiException.class);
    var f = backups.export();
    BackupValidator.Prepared p;
    try {
      p = validator.parse(Files.readAllBytes(f));
    } finally {
      Files.delete(f);
    }
    p.records().getFirst().record().setCountry(null);
    assertThatThrownBy(() -> restores.restore("broken", "digest", "initial-admin", p))
        .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    assertThat(records.get("ins", id).get("country")).isEqualTo("美国");
    assertThat(jdbc.queryForObject("select count(*) from backup_restore_runs", Long.class))
        .isZero();
  }

  @Test
  void concurrentImagesCannotExceedTen() throws Exception {
    String id = newRecord("198.65.111.0/24").get("id").toString();
    byte[] bytes = png();
    var file = new MockMultipartFile("files", "p.png", "image/png", bytes);
    images.upload("ins", id, Collections.nCopies(9, file));
    try (var pool = Executors.newFixedThreadPool(2)) {
      Callable<Boolean> upload =
          () -> {
            try {
              images.upload("ins", id, List.of(file));
              return true;
            } catch (ApiException e) {
              return false;
            }
          };
      var results = pool.invokeAll(List.of(upload, upload));
      int successes = 0;
      for (var result : results) if (result.get()) successes++;
      assertThat(successes).isEqualTo(1);
    }
    assertThat(images.list("ins", id)).hasSize(10);
    records.delete("ins", List.of(id));
    assertThat(jdbc.queryForObject("select count(*) from record_evidence_images", Long.class))
        .isZero();
  }

  @Test
  void exclusiveRestoreGuardRejectsNewWrites() throws Exception {
    var entered = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    try (var pool = Executors.newSingleThreadExecutor()) {
      var future =
          pool.submit(
              () ->
                  new TransactionTemplate(transactionManager)
                      .executeWithoutResult(
                          status -> {
                            guard.restore();
                            entered.countDown();
                            try {
                              if (!release.await(10, TimeUnit.SECONDS))
                                throw new IllegalStateException("timeout");
                            } catch (InterruptedException e) {
                              Thread.currentThread().interrupt();
                              throw new IllegalStateException(e);
                            }
                          }));
      assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
      try {
        assertThatThrownBy(() -> accounts.importAccounts("ins", List.of(Map.of())))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("恢复");
      } finally {
        release.countDown();
      }
      future.get(5, TimeUnit.SECONDS);
    }
  }

  @Test
  void apiContractPaginationAndOpenApiAreAvailable() throws Exception {
    var client = new Client();
    client.login("test-admin");
    var response =
        client.json(
            "POST",
            "/api/v1/platforms/ins/accounts/import",
            Map.of("rows", List.of(Map.of("account", "first"))));
    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(map(client.json("GET", "/api/v1/platforms/ins/accounts?pageSize=10", null).body()))
        .containsKeys("items", "total", "page", "pageSize");
    assertThat(client.json("GET", "/v3/api-docs", null).statusCode()).isEqualTo(200);
  }

  @Test
  void missingBooleanAndUnknownTargetsDoNotMutateData() throws Exception {
    var client = new Client();
    client.login("test-admin");
    var imported = accounts.importAccounts("ins", List.of(Map.of("used", true)));
    String id = ((List<?>) imported.get("ids")).getFirst().toString();
    var module = flows.create("ins", false, Map.of("name", "Module", "archived", true));
    assertThat(
            client
                .json("PATCH", "/api/v1/platforms/ins/accounts/" + id + "/used", Map.of())
                .statusCode())
        .isEqualTo(422);
    assertThat(accounts.get("ins", id).getUsed()).isTrue();
    assertThat(
            client
                .json(
                    "PATCH",
                    "/api/v1/platforms/ins/modules/" + module.getId() + "/archive",
                    Map.of())
                .statusCode())
        .isEqualTo(422);
    assertThat(
            ((com.mark.appeal.domain.AppealModule) flows.get("ins", false, module.getId()))
                .getArchived())
        .isTrue();
    assertThat(
            client
                .json("DELETE", "/api/v1/platforms/ins/appeal-records/missing", null)
                .statusCode())
        .isEqualTo(404);
    var unknown = client.json("GET", "/api/v1/no-such-route", null);
    assertThat(unknown.statusCode()).isEqualTo(404);
    assertThat(map(unknown.body()).get("code")).isEqualTo("NOT_FOUND");
    assertThat(client.json("GET", "/api/v1/platforms/ins/accounts?page=invalid", null).statusCode())
        .isEqualTo(400);
  }

  @Test
  void partialUpdatesKeepOtherFieldsAndCanExplicitlyUnlink() {
    var imported = accounts.importAccounts("ins", List.of(Map.of("account", "keep")));
    String accountId = ((List<?>) imported.get("ids")).getFirst().toString();
    var record = newRecord("198.65.111.0/24");
    String id = record.get("id").toString();
    records.patch("ins", id, Map.of("note", "keep-note", "accountId", accountId));
    records.patch("ins", id, Map.of("status", "已提交"));
    assertThat(records.get("ins", id))
        .containsEntry("note", "keep-note")
        .containsEntry("accountId", accountId);
    var unlink = new HashMap<String, Object>();
    unlink.put("accountId", null);
    assertThat(records.patch("ins", id, unlink))
        .doesNotContainKey("accountId")
        .containsEntry("status", "已提交");
    assertThatThrownBy(
            () ->
                records.credentials("ins", id, Arrays.asList((RecordService.CredentialEdit) null)))
        .isInstanceOf(ApiException.class);
    records.deleteOne("ins", id);
    assertThatThrownBy(() -> records.patch("ins", id, Map.of("note", "stale")))
        .isInstanceOf(ApiException.class);
  }

  @Test
  void flowReferencesAreProtectedAndStepOrderSwapIsAtomic() {
    var module = flows.create("ins", false, Map.of("name", "Module"));
    var first =
        flows.create(
            "ins",
            true,
            Map.of(
                "moduleId",
                module.getId(),
                "name",
                "First",
                "instructions",
                "Do first",
                "sortOrder",
                1));
    var second =
        flows.create(
            "ins",
            true,
            Map.of(
                "moduleId",
                module.getId(),
                "name",
                "Second",
                "instructions",
                "Do second",
                "sortOrder",
                2));
    assertThatThrownBy(() -> flows.delete("ins", false, module.getId()))
        .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    flows.swap("ins", List.of(first.getId(), second.getId()));
    assertThat(
            ((com.mark.appeal.domain.AppealStep) flows.get("ins", true, first.getId()))
                .getSortOrder())
        .isEqualTo(2);
    assertThat(
            ((com.mark.appeal.domain.AppealStep) flows.get("ins", true, second.getId()))
                .getSortOrder())
        .isEqualTo(1);
    String recordId = newRecord("198.65.111.0/24").get("id").toString();
    records.patch("ins", recordId, Map.of("moduleId", module.getId(), "stepId", first.getId()));
    assertThatThrownBy(() -> flows.delete("ins", true, first.getId()))
        .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    flows.patch("ins", true, first.getId(), Map.of("archived", true));
    assertThat(records.get("ins", recordId)).containsEntry("stepId", first.getId());
  }

  @Test
  void checkedImageReadFailureRollsBackEarlierImages() throws Exception {
    String id = newRecord("198.65.111.0/24").get("id").toString();
    var valid = new MockMultipartFile("files", "good.png", "image/png", png());
    var unreadable =
        new MockMultipartFile("files", "bad.png", "image/png", png()) {
          @Override
          public byte[] getBytes() throws java.io.IOException {
            throw new java.io.IOException("test read failure");
          }
        };
    assertThatThrownBy(() -> images.upload("ins", id, List.of(valid, unreadable)))
        .isInstanceOf(java.io.IOException.class);
    assertThat(images.list("ins", id)).isEmpty();
  }

  @Test
  void sessionRotationCookieAttributesAndExpiredRows() throws Exception {
    var client = new Client();
    var before = client.request("GET", "/api/v1/auth/csrf", null, false, "application/json");
    String cookie = before.headers().firstValue("set-cookie").orElseThrow();
    assertThat(cookie).contains("HttpOnly", "SameSite=Lax", "Path=/");
    String beforeId = jdbc.queryForObject("select session_id from spring_session", String.class);
    client.csrf = map(before.body()).get("token").toString();
    assertThat(
            client
                .request(
                    "POST",
                    "/api/v1/auth/login",
                    "username=test-admin&password=" + PASSWORD,
                    true,
                    "application/x-www-form-urlencoded")
                .statusCode())
        .isEqualTo(200);
    assertThat(
            jdbc.queryForObject(
                "select session_id from spring_session where principal_name='test-admin'",
                String.class))
        .isNotEqualTo(beforeId);
    assertThat(
            client
                .json(
                    "POST",
                    "/api/v1/platforms/ins/accounts/import",
                    Map.of("rows", List.of(Map.of())))
                .statusCode())
        .isEqualTo(403);
    client.csrf();
    assertThat(
            client
                .json(
                    "POST",
                    "/api/v1/platforms/ins/accounts/import",
                    Map.of("rows", List.of(Map.of())))
                .statusCode())
        .isEqualTo(200);
    long past = System.currentTimeMillis() - 9 * 60 * 60 * 1000L;
    jdbc.update(
        "update spring_session set last_access_time=?,expiry_time=? where principal_name='test-admin'",
        past,
        past + 28800000L);
    assertThat(client.json("GET", "/api/v1/auth/me", null).statusCode()).isEqualTo(401);
  }

  @Test
  void v1BackupPreservesNonUuidIdsAndMissingAccountValues() throws Exception {
    var row = new LinkedHashMap<String, Object>();
    row.put("id", "old-account-id");
    row.put("platformId", "ins");
    row.put("createdAt", "2026-01-01T00:00:00Z");
    row.put("updatedAt", "2026-01-01T00:00:00Z");
    row.put("archived", true);
    for (String key :
        List.of(
            "country", "account", "password", "emailAccount", "emailPassword", "twoFactor", "note"))
      row.put(key, "");
    byte[] backup =
        json.writeValueAsBytes(
            Map.of(
                "format",
                "platform-appeal-manager-backup",
                "version",
                1,
                "exportedAt",
                "2026-01-01T00:00:00Z",
                "data",
                Map.of(
                    "accounts",
                    List.of(row),
                    "appealModules",
                    List.of(),
                    "appealSteps",
                    List.of(),
                    "appealRecords",
                    List.of())));
    var prepared = validator.parse(backup);
    assertThat(prepared.images()).isEmpty();
    restores.restore("v1", ImageContent.sha256(backup), "initial-admin", prepared);
    assertThat(accounts.get("ins", "old-account-id").getAccount()).isEmpty();
    var exported = backups.export();
    try {
      var parsed = validator.parse(Files.readAllBytes(exported));
      assertThat(parsed.accounts().getFirst().getId()).isEqualTo("old-account-id");
      assertThat(parsed.accounts().getFirst().getLegacyArchived()).isTrue();
    } finally {
      Files.delete(exported);
    }
  }

  @Test
  void oversizedJsonBodyIsRejectedWithoutWriting() throws Exception {
    var client = new Client();
    client.login("test-admin");
    assertThat(
            client
                .json(
                    "POST",
                    "/api/v1/platforms/ins/accounts/import",
                    Map.of("rows", List.of(Map.of("note", "x".repeat(2 * 1024 * 1024)))))
                .statusCode())
        .isEqualTo(413);
    assertThat(accounts.list("ins", 1, 10, null, null, null).total()).isZero();
  }

  @Test
  void readonlyCannotCallAnyBusinessWriteEndpointButCanReadImageBytes() throws Exception {
    String id = newRecord("198.65.111.0/24").get("id").toString();
    byte[] bytes = png();
    String imageId =
        images
            .upload(
                "ins", id, List.of(new MockMultipartFile("files", "proof.png", "image/png", bytes)))
            .getFirst()
            .id();
    var reader = new Client();
    reader.login("test-reader");
    String base = "/api/v1/platforms/ins/";
    var writes =
        List.of(
            "POST accounts",
            "PATCH accounts/id",
            "PATCH accounts/id/used",
            "DELETE accounts/id",
            "POST accounts/import",
            "POST modules",
            "PATCH modules/id",
            "PATCH modules/id/archive",
            "DELETE modules/id",
            "POST steps",
            "PATCH steps/id",
            "PATCH steps/id/archive",
            "DELETE steps/id",
            "POST steps/swap-order",
            "POST appeal-records",
            "PATCH appeal-records/id",
            "DELETE appeal-records/id",
            "PATCH appeal-records/batch-status",
            "POST appeal-records/batch-delete",
            "POST appeal-records/quick-import",
            "PATCH appeal-records/id/ips/ip/completed",
            "PATCH appeal-records/id/verification-ips",
            "POST appeal-records/verification-ips/quick-import",
            "POST appeal-records/id/images",
            "DELETE appeal-records/id/images/image");
    for (String route : writes) {
      String[] parts = route.split(" ", 2);
      assertThat(reader.json(parts[0], base + parts[1], Map.of()).statusCode())
          .as(route)
          .isEqualTo(403);
    }
    assertThat(reader.json("POST", "/api/v1/backups/restore", Map.of()).statusCode())
        .isEqualTo(403);
    String imagePath = base + "appeal-records/" + id + "/images/" + imageId;
    var response =
        reader.http.send(
            HttpRequest.newBuilder(URI.create("http://localhost:" + port + imagePath))
                .GET()
                .build(),
            HttpResponse.BodyHandlers.ofByteArray());
    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(response.body()).isEqualTo(bytes);
    assertThat(response.headers().firstValue("content-type")).contains("image/png");
    assertThat(new Client().request("GET", imagePath, null, false, "application/json").statusCode())
        .isEqualTo(401);
    assertThat(reader.json("GET", imagePath.replace("/ins/", "/google/"), null).statusCode())
        .isEqualTo(404);
  }
}
