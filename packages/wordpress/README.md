# @kidecms/wordpress

WordPress → Kide CMS importer. Scout a MySQL dump, describe the target with `defineMapping`, then
`kide-wp plan → apply → verify → check-live`. The playbook is [`PLAYBOOK.md`](./PLAYBOOK.md).

```bash
pnpm add -D @kidecms/wordpress
pnpm exec kide-wp scout wordpress.sql.gz
```
