/**
 * Roteamento por identificador público (docs/MULTITENANT.md §2.1/§3).
 *
 * Com um banco por tenant, identificadores públicos (slug de evento, código de
 * pedido, token de ingresso…) precisam de um mapa central `key → org` para a
 * borda descobrir QUAL banco consultar — e o unique (kind,key) na plataforma
 * preserva a unicidade global que o Postgres único garantia.
 *
 * Regra de consistência (sem transação cross-DB): RESERVE a ref na plataforma
 * ANTES de gravar o recurso no tenant. Falha no meio deixa uma ref órfã
 * (inócua, reciclável); nunca um recurso inalcançável ou duplicado.
 */
export type PublicRefKind =
  | "EVENT_SLUG"
  | "EVENT_ID"
  | "ORDER_CODE"
  | "TICKET_TOKEN"
  | "PROMOTER_CODE"
  | "PROMOTER_REPORT"
  | "PROVIDER_TX";

export interface PublicRefPort {
  /**
   * Reserva (kind,key) para a org. Idempotente para a MESMA org (true);
   * false quando a chave já pertence a OUTRA org — o chamador tenta outra
   * chave ou falha com erro genérico.
   */
  reserve(kind: PublicRefKind, key: string, organizationId: string): Promise<boolean>;
  /** organizationId dono da chave, ou null (borda mapeia para 404 genérico). */
  resolve(kind: PublicRefKind, key: string): Promise<string | null>;
  /** Compensação/limpeza — só remove se pertencer à org informada. */
  release(kind: PublicRefKind, key: string, organizationId: string): Promise<void>;
}
