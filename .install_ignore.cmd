@echo off
cd /d e:\xiangm\agentpet-backup\agentpet\yachiyo-airi
pnpm install --ignore-scripts > .pnpm_ignore.log 2>&1
echo DONE_IGNORE_SCRIPTS > .pnpm_ignore.done
