import { Migration } from '@mikro-orm/migrations';

export class Migration20261109164011_communications extends Migration {

  override name = 'Migration20261109164011';

  override up(): void | Promise<void> {
    this.addSql(`create table "communications_send_requests" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid null, "user_id" uuid not null, "client_request_id" text not null, "channel_id" uuid not null, "message_id" uuid null, "message_thread_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "communications_send_requests_scope_idx" on "communications_send_requests" ("tenant_id", "user_id", "created_at");`);
    this.addSql(`alter table "communications_send_requests" add constraint "communications_send_requests_uq" unique ("tenant_id", "user_id", "client_request_id");`);
  }

}
