package com.mark.appeal.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import java.time.OffsetDateTime;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public abstract class BaseEntity {
  @TableId private String id;
  private String platformId;
  private OffsetDateTime createdAt;
  private OffsetDateTime updatedAt;
}
