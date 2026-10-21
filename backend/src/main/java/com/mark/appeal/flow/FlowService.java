package com.mark.appeal.flow;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mark.appeal.common.*;
import com.mark.appeal.domain.*;
import com.mark.appeal.maintenance.WorkspaceWriteGuard;
import com.mark.appeal.mapper.*;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FlowService {
  private static final Set<String> MODULE_FIELDS =
      Set.of("name", "description", "enabled", "sortOrder", "note", "archived");
  private static final Set<String> STEP_FIELDS =
      Set.of("moduleId", "name", "instructions", "sortOrder", "note", "archived");
  private final AppealModuleMapper modules;
  private final AppealStepMapper steps;
  private final JdbcTemplate jdbc;
  private final WorkspaceWriteGuard guard;

  public FlowService(
      AppealModuleMapper modules,
      AppealStepMapper steps,
      JdbcTemplate jdbc,
      WorkspaceWriteGuard guard) {
    this.modules = modules;
    this.steps = steps;
    this.jdbc = jdbc;
    this.guard = guard;
  }

  public PageResult<?> list(String p, boolean step, String moduleId, long page, long size) {
    Platforms.require(p);
    Inputs.page(page, size);
    if (step) {
      var q =
          new QueryWrapper<AppealStep>()
              .eq("platform_id", p)
              .eq(moduleId != null, "module_id", moduleId)
              .orderByAsc("sort_order", "id");
      var r = steps.selectPage(new Page<>(page, size), q);
      return new PageResult<>(r.getRecords(), r.getTotal(), page, size);
    }
    var r =
        modules.selectPage(
            new Page<>(page, size),
            new QueryWrapper<AppealModule>().eq("platform_id", p).orderByAsc("sort_order", "id"));
    return new PageResult<>(r.getRecords(), r.getTotal(), page, size);
  }

  public BaseEntity get(String p, boolean step, String id) {
    Platforms.require(p);
    BaseEntity e =
        step
            ? steps.selectOne(new QueryWrapper<AppealStep>().eq("platform_id", p).eq("id", id))
            : modules.selectOne(new QueryWrapper<AppealModule>().eq("platform_id", p).eq("id", id));
    if (e == null) throw ApiException.missing();
    return e;
  }

  @Transactional
  public BaseEntity create(String p, boolean step, Map<String, Object> v) {
    guard.write();
    Inputs.allowed(v, step ? STEP_FIELDS : MODULE_FIELDS);
    if (step) {
      var e = new AppealStep();
      Inputs.initialize(e, p);
      e.setModuleId(Inputs.required(v, "moduleId"));
      get(p, false, e.getModuleId());
      e.setName(Inputs.required(v, "name"));
      e.setInstructions(Inputs.required(v, "instructions"));
      e.setSortOrder(Inputs.integer(v, "sortOrder", 0));
      e.setNote(Inputs.text(v, "note"));
      e.setArchived(Inputs.bool(v, "archived", false));
      steps.insert(e);
      return e;
    }
    var e = new AppealModule();
    Inputs.initialize(e, p);
    e.setName(Inputs.required(v, "name"));
    e.setDescription(Inputs.text(v, "description"));
    e.setEnabled(Inputs.bool(v, "enabled", true));
    e.setSortOrder(Inputs.integer(v, "sortOrder", 0));
    e.setNote(Inputs.text(v, "note"));
    e.setArchived(Inputs.bool(v, "archived", false));
    modules.insert(e);
    return e;
  }

  @Transactional
  public BaseEntity patch(String p, boolean step, String id, Map<String, Object> v) {
    guard.write();
    get(p, step, id);
    Inputs.allowed(v, step ? STEP_FIELDS : MODULE_FIELDS);
    var columns =
        Map.of(
            "moduleId",
            "module_id",
            "name",
            "name",
            "instructions",
            "instructions",
            "sortOrder",
            "sort_order",
            "note",
            "note",
            "description",
            "description",
            "enabled",
            "enabled",
            "archived",
            "archived");
    var u =
        new UpdateWrapper<BaseEntity>()
            .eq("platform_id", p)
            .eq("id", id)
            .set("updated_at", OffsetDateTime.now());
    for (var entry : v.entrySet()) {
      String k = entry.getKey();
      Object value =
          switch (k) {
            case "enabled", "archived" -> Inputs.bool(v, k, false);
            case "sortOrder" -> Inputs.integer(v, k, 0);
            case "moduleId", "name", "instructions" -> Inputs.required(v, k);
            default -> Inputs.text(v, k);
          };
      u.set(columns.get(k), value);
    }
    // Both wrappers contain only server-whitelisted columns and bound values.
    int count = step ? steps.update(null, cast(u)) : modules.update(null, cast(u));
    if (count != 1) throw ApiException.missing();
    return get(p, step, id);
  }

  @SuppressWarnings({"unchecked", "rawtypes"})
  private static <T> UpdateWrapper<T> cast(UpdateWrapper<?> v) {
    return (UpdateWrapper) v;
  }

  @Transactional
  public void delete(String p, boolean step, String id) {
    guard.write();
    Platforms.require(p);
    int count =
        step
            ? steps.delete(new QueryWrapper<AppealStep>().eq("platform_id", p).eq("id", id))
            : modules.delete(new QueryWrapper<AppealModule>().eq("platform_id", p).eq("id", id));
    if (count != 1) throw ApiException.missing();
  }

  @Transactional
  public void swap(String p, List<String> ids) {
    guard.write();
    Platforms.require(p);
    var unique = Inputs.ids(ids).stream().sorted().toList();
    if (unique.size() != 2) throw ApiException.invalid("需要两个不同步骤");
    var rows =
        jdbc.queryForList(
            "select id,module_id,sort_order from appeal_steps where platform_id=? and id in (?,?) order by id for update",
            p,
            unique.get(0),
            unique.get(1));
    if (rows.size() != 2) throw ApiException.missing();
    if (!rows.get(0).get("module_id").equals(rows.get(1).get("module_id")))
      throw ApiException.invalid("只能交换同一模块的步骤");
    for (int i = 0; i < 2; i++)
      jdbc.update(
          "update appeal_steps set sort_order=?,updated_at=now() where id=?",
          rows.get(1 - i).get("sort_order"),
          rows.get(i).get("id"));
  }
}
