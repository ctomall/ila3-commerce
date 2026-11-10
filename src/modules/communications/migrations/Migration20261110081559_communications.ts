import { Migration } from '@mikro-orm/migrations';

export class Migration20261110081559_communications extends Migration {

  override name = 'Migration20261110081559';

  override up(): void | Promise<void> {
    this.addSql(`alter table "communications_send_requests" add "payload_hash" text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "communications_send_requests" drop column "payload_hash";`);
  }

}
