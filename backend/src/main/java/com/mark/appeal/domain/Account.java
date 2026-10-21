package com.mark.appeal.domain;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@TableName("accounts")
public class Account extends BaseEntity {
  private String country;
  private String account;
  private String password;
  private String emailAccount;
  private String emailPassword;
  private String twoFactor;
  private String token;
  private String decodeLink;
  private String note;
  private Boolean used;
  private Boolean legacyArchived;
}
