package com.mark.appeal.config;

import org.flywaydb.core.api.callback.Callback;
import org.flywaydb.core.api.callback.Context;
import org.flywaydb.core.api.callback.Event;
import org.springframework.stereotype.Component;

/** Validate replacement text before Flyway sends any seed SQL to PostgreSQL. */
@Component
public class SeedValidation implements Callback {
  @Override
  public boolean supports(Event event, Context context) {
    return event == Event.BEFORE_MIGRATE;
  }

  @Override
  public boolean canHandleInTransaction(Event event, Context context) {
    return true;
  }

  @Override
  public String getCallbackName() {
    return "validate-initial-user-placeholders";
  }

  @Override
  public void handle(Event event, Context context) {
    var p = context.getConfiguration().getPlaceholders();
    for (String key : new String[] {"adminUsername", "readonlyUsername"}) {
      if (!p.getOrDefault(key, "").matches("[A-Za-z0-9_.@-]{1,100}"))
        throw new IllegalStateException("Invalid initial username configuration: " + key);
    }
    if (p.get("adminUsername").equals(p.get("readonlyUsername")))
      throw new IllegalStateException("Initial usernames must differ");
    for (String key : new String[] {"adminPasswordHash", "readonlyPasswordHash"}) {
      if (!p.getOrDefault(key, "").matches("\\{bcrypt\\}\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}"))
        throw new IllegalStateException("Invalid initial password hash configuration: " + key);
    }
  }
}
