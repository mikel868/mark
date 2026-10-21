package com.mark.appeal.auth;

import com.mark.appeal.AppealApplication;
import java.util.Arrays;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.transaction.support.TransactionTemplate;

/** Run with Maven exec:java; reads passwords from console/stdin, never command-line arguments. */
public final class UserMaintenanceCommand {
  private UserMaintenanceCommand() {}

  public static void main(String[] args) throws Exception {
    if (args.length == 0 || !(args[0].equals("hash") || args[0].equals("reset")))
      throw new IllegalArgumentException("Use hash or reset <username>");
    char[] secret;
    if (System.console() == null) {
      String line = new java.io.BufferedReader(new java.io.InputStreamReader(System.in)).readLine();
      secret = line == null ? null : line.toCharArray();
    } else {
      secret = System.console().readPassword("Password: ");
    }
    if (secret == null || secret.length == 0) throw new IllegalArgumentException("Empty password");
    var hash =
        PasswordEncoderFactories.createDelegatingPasswordEncoder().encode(new String(secret));
    Arrays.fill(secret, '\0');
    if (args[0].equals("hash")) {
      System.out.println(hash);
      return;
    }
    if (args.length != 2) throw new IllegalArgumentException("Use reset <username>");
    try (var context =
        new SpringApplicationBuilder(AppealApplication.class)
            .web(WebApplicationType.SERVLET)
            .run("--server.port=0", "--server.address=127.0.0.1")) {
      var jdbc = context.getBean(JdbcTemplate.class);
      var tx = context.getBean(org.springframework.transaction.PlatformTransactionManager.class);
      new TransactionTemplate(tx)
          .executeWithoutResult(
              status -> {
                if (jdbc.update(
                        "update app_users set password_hash=? where username=?", hash, args[1])
                    != 1) throw new IllegalArgumentException("Unknown user");
                // Same JDBC transaction: password update and existing-session revocation succeed
                // together.
                jdbc.update("delete from spring_session where principal_name=?", args[1]);
              });
    }
  }
}
