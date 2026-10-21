package com.mark.appeal.domain;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@TableName("appeal_modules")
public class AppealModule extends BaseEntity {
  private String name;
  private String description;
  private Boolean enabled;
  private Integer sortOrder;
  private String note;
  private Boolean archived;
}
