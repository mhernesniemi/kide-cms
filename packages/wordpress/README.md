# @kidecms/wordpress

WordPress → Kide CMS importer. Scout a MySQL dump, describe the target with `defineMapping`, then
`kide import plan → apply → verify → check-live`. The playbook is `MIGRATING.md` in a Kide project.

```bash
pnpm add -D @kidecms/wordpress
pnpm exec kide import scout wordpress.sql.gz
```
