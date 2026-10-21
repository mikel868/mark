package com.mark.appeal.domain;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@TableName("appeal_steps")
public class AppealStep extends BaseEntity {
  private String moduleId;
  private String name;
  private String instructions;
  private Integer sortOrder;
  private String note;
  private Boolean archived;
}
