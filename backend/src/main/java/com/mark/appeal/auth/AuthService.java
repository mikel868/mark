package com.mark.appeal.auth;

import com.mark.appeal.common.ApiException;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
  private final JdbcTemplate jdbc;

  public AuthService(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public Map<String, Object> me(Authentication auth) {
    if (auth == null) throw new ApiException(401, "AUTH_REQUIRED", "请先登录");
    return jdbc
        .query(
            "select id,username,role from app_users where username=?",
            (rs, n) ->
                Map.<String, Object>of(
                    "id", rs.getString(1), "username", rs.getString(2), "role", rs.getString(3)),
            auth.getName())
        .stream()
        .findFirst()
        .orElseThrow(() -> new ApiException(401, "AUTH_REQUIRED", "会话无效"));
  }
}
