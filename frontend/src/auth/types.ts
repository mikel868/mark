export type AuthRole = 'admin' | 'readonly'

export interface AuthUser {
  username: string
  role: AuthRole
}
