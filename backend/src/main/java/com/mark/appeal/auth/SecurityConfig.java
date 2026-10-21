package com.mark.appeal.auth;

import com.mark.appeal.common.ApiErrors;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import org.springframework.session.web.http.DefaultCookieSerializer;
import tools.jackson.databind.json.JsonMapper;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {
  @Bean
  PasswordEncoder passwordEncoder() {
    return PasswordEncoderFactories.createDelegatingPasswordEncoder();
  }

  @Bean
  UserDetailsService users(JdbcTemplate jdbc) {
    return name ->
        jdbc
            .query(
                "select username,password_hash,role,enabled from app_users where username=?",
                (rs, n) ->
                    User.withUsername(rs.getString(1))
                        .password(rs.getString(2))
                        .roles(rs.getString(3))
                        .disabled(!rs.getBoolean(4))
                        .build(),
                name)
            .stream()
            .findFirst()
            .orElseThrow(() -> new UsernameNotFoundException("Invalid credentials"));
  }

  @Bean
  DefaultCookieSerializer cookieSerializer(@Value("${app.secure-cookie}") boolean secure) {
    var cookie = new DefaultCookieSerializer();
    cookie.setCookieName("SESSION");
    cookie.setCookiePath("/");
    cookie.setUseHttpOnlyCookie(true);
    cookie.setUseSecureCookie(secure);
    cookie.setSameSite("Lax");
    return cookie;
  }

  @Bean
  SecurityFilterChain security(HttpSecurity http, JsonMapper json, AuthService auth)
      throws Exception {
    http.csrf(
        csrf ->
            csrf.csrfTokenRepository(new HttpSessionCsrfTokenRepository())
                .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()));
    http.authorizeHttpRequests(
        r ->
            r.requestMatchers(
                    HttpMethod.GET,
                    "/api/v1/auth/csrf",
                    "/actuator/health",
                    "/actuator/health/liveness",
                    "/actuator/health/readiness")
                .permitAll()
                .requestMatchers(HttpMethod.POST, "/api/v1/auth/login")
                .permitAll()
                .requestMatchers(
                    HttpMethod.GET,
                    "/api/**",
                    "/v3/api-docs/**",
                    "/swagger-ui/**",
                    "/swagger-ui.html")
                .authenticated()
                .requestMatchers("/api/**")
                .hasRole("ADMIN")
                .anyRequest()
                .denyAll());
    http.formLogin(
        f ->
            f.loginProcessingUrl("/api/v1/auth/login")
                .successHandler(
                    (req, res, a) -> {
                      res.setContentType("application/json;charset=UTF-8");
                      json.writeValue(res.getOutputStream(), auth.me(a));
                    })
                .failureHandler(
                    (req, res, e) -> error(res, json, 401, "LOGIN_FAILED", "用户名或密码错误")));
    http.logout(
        l ->
            l.logoutUrl("/api/v1/auth/logout")
                .invalidateHttpSession(true)
                .clearAuthentication(true)
                .deleteCookies("SESSION")
                .logoutSuccessHandler((req, res, a) -> res.setStatus(204)));
    http.exceptionHandling(
        e ->
            e.authenticationEntryPoint(
                    (req, res, ex) -> error(res, json, 401, "AUTH_REQUIRED", "请先登录"))
                .accessDeniedHandler(
                    (req, res, ex) ->
                        error(
                            res,
                            json,
                            403,
                            ex instanceof CsrfException ? "CSRF_INVALID" : "FORBIDDEN",
                            "请求被拒绝，请检查登录、权限及 CSRF")));
    http.requestCache(c -> c.disable());
    return http.build();
  }

  private static void error(
      HttpServletResponse res, JsonMapper json, int status, String code, String message)
      throws IOException {
    res.setStatus(status);
    res.setContentType("application/json;charset=UTF-8");
    json.writeValue(res.getOutputStream(), ApiErrors.body(code, message));
  }
}
