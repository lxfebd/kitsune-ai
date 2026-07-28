@echo off
cd /d e:\xiangm\agentpet-backup\agentpet\yachiyo-airi
set NODE_OPTIONS=
pnpm -F @kitsune/stage-tamagotchi dev > .dev_run.log 2>&1
