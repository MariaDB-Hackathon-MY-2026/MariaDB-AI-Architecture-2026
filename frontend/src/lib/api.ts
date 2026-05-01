export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:8000';

let _unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(fn: () => void): void {
  _unauthorizedHandler = fn;
}

export async function jsonFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  if (res.status === 401 && !path.includes('/auth/')) {
    _unauthorizedHandler?.();
  }
  if (!res.ok) {
    const msg = (body && (body as { detail?: string }).detail) || res.statusText;
    throw new Error(msg);
  }
  return body as T;
}

export async function rawFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  return fetch(url, { ...init, credentials: 'include' });
}

export interface MeResponse {
  id: string;
  email: string;
  has_settings: boolean;
}

export interface UserSettingsModel {
  mariadb_host: string;
  mariadb_port: number;
  mariadb_user: string;
  mariadb_password: string;
  mariadb_database: string;
  ollama_base_url: string;
  ollama_model: string;
}

export interface HealthResponse {
  ok: boolean;
  database: string;
}

export interface OllamaHealthResponse {
  ok: boolean;
  message: string;
}

export interface SchemaGenerateResponse {
  plan: unknown;
  statements: string[];
}

export interface SqlExecuteResponse {
  executed: number;
}

export interface MetadataResponse {
  tables: string[];
}

export interface StatsResponse {
  table_count: number;
  total_rows: number;
  snapshot_count: number;
  audit_count: number;
}

export interface SchemaSnapshotResponse {
  id: string;
  at: string;
  label?: string | null;
  tables: string[];
}

export interface ListSchemaSnapshotsResponse {
  versions: SchemaSnapshotResponse[];
}

export interface SchemaDiffResponse {
  tables_added: string[];
  tables_removed: string[];
  columns_added: string[];
  columns_removed: string[];
  fks_added: string[];
  fks_removed: string[];
}

export interface QueryPlanResponse {
  title: string | null;
  sql: string;
  params: unknown[];
}

export interface QueryExecuteResponse {
  columns: string[];
  rows: unknown[][];
}

export interface AuditEntry {
  at: string;
  kind: string;
  statement: string;
}

export interface AuditResponse {
  entries: AuditEntry[];
}

export interface JobStatusResponse {
  id: string;
  kind: string;
  status: 'queued' | 'running' | 'done' | 'error';
  message: string;
  result?: { counts?: unknown } | null;
  error?: string | null;
}

export interface MigrationPreviewResponse {
  title?: string | null;
  sql: string;
  warnings: string[];
}

export interface AiMigrationResponse {
  title: string | null;
  statements: string[];
}

export interface SchemaEdge {
  source: string;
  target: string;
}

export interface SchemaEdgesResponse {
  edges: SchemaEdge[];
}

export interface DiagramResponse {
  code: string;
}

export interface MermaidLinksResponse {
  mermaid_live_edit_url: string;
  svg_url: string;
  png_url: string;
}

export interface TableColumn {
  name: string;
  sql_type: string;
  is_nullable: boolean;
  is_auto_increment: boolean;
}

export interface ForeignKeyConstraint {
  constraint_name?: string;
  table_name?: string;
  column_name: string;
  referenced_table_name: string;
  referenced_column_name: string;
  referenced_label_column?: string | null;
  update_rule?: string;
  delete_rule?: string;
}

export interface IndexInfoModel {
  index_name: string;
  is_unique: boolean;
  columns: string[];
}

export interface TableMetaResponse {
  table: string;
  columns: TableColumn[];
  primary_key: string[];
  outbound_foreign_keys: ForeignKeyConstraint[];
  foreign_keys?: ForeignKeyConstraint[];
  indexes?: IndexInfoModel[];
}

export interface BrowseResponse {
  columns: string[];
  rows: unknown[][];
  total_rows: number;
}

export interface FkOption {
  id: unknown;
  label: unknown;
}

export interface FkOptionsResponse {
  options: FkOption[];
}

export interface MutationResponse {
  affected_rows: number;
}

export interface QueryExportResponse {
  filename: string;
  mime: string;
  data_base64: string;
}

export interface WritePreviewResponse {
  operation: string;
  title: string;
  write_sql: string;
  preview_sql: string;
  params: unknown[];
  preview_params: unknown[];
  preview_columns: string[];
  preview_rows: unknown[][];
}

export interface WriteExecuteResponse {
  affected_rows: number;
}

export interface DatabaseExportResponse {
  sql: string;
  filename: string;
  table_count: number;
  row_count: number;
}

export interface RelatedTablesResponse {
  tables: string[];
}
