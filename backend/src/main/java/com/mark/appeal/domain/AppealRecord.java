package com.mark.appeal.domain;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@TableName("appeal_records")
public class AppealRecord extends BaseEntity {
  private String status;
  private String country;
  private java.time.OffsetDateTime appealedAt;
  private String appealPlatform;
  private String accountId;
  private String moduleId;
  private String stepId;
  private String note;
  private String template1;
  private String template2;
  private Boolean archived;
}
