<script setup lang="ts">
import type { DoctorResult, FixResult } from '../../../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { Button, Callout, TransitionVertical } from '@kitsune/ui'
import { computed, ref } from 'vue'

import {
  electronDoctorFix,
  electronDoctorRun,
} from '../../../../../shared/eventa'
import { useEnvironmentI18n } from './use-environment-i18n'

const { tn } = useEnvironmentI18n()
const invokeDoctorRun = useElectronEventaInvoke(electronDoctorRun)
const invokeDoctorFix = useElectronEventaInvoke(electronDoctorFix)

const PANEL = 'settings-panel'

const doctorResults = ref<DoctorResult[]>([])
const fixResults = ref<FixResult[]>([])
const doctorRunning = ref(false)
const doctorFixing = ref(false)
const errorMessage = ref('')

const DOCTOR_LEVEL_BADGE: Record<DoctorResult['level'], string> = {
  PASS: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  WARN: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  FAIL: 'bg-red-500/15 text-red-700 dark:text-red-300',
  INFO: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
}

const FIX_LEVEL_BADGE: Record<FixResult['level'], string> = {
  FIXED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  MANUAL: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
}

const doctorStats = computed(() => {
  const acc = { pass: 0, warn: 0, fail: 0, info: 0, total: doctorResults.value.length }
  for (const r of doctorResults.value) {
    if (r.level === 'PASS')
      acc.pass++
    else if (r.level === 'WARN')
      acc.warn++
    else if (r.level === 'FAIL')
      acc.fail++
    else if (r.level === 'INFO')
      acc.info++
  }
  return acc
})

async function runDoctor() {
  doctorRunning.value = true
  errorMessage.value = ''
  try {
    const result = await invokeDoctorRun({})
    doctorResults.value = result ?? []
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
  }
  finally {
    doctorRunning.value = false
  }
}

async function fixDoctor() {
  doctorFixing.value = true
  errorMessage.value = ''
  try {
    const result = await invokeDoctorFix({})
    fixResults.value = result ?? []
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
  }
  finally {
    doctorFixing.value = false
  }
}
</script>

<template>
  <section :class="PANEL">
    <Callout v-if="errorMessage" theme="orange" :label="tn('doctor.error-title')">
      {{ errorMessage }}
    </Callout>
    <div class="flex items-center justify-between gap-2 flex-wrap">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ tn('doctor.title') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ tn('doctor.description') }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button
          variant="primary" size="sm"
          :loading="doctorRunning"
          :disabled="doctorFixing"
          :label="doctorRunning ? tn('doctor.actions.running') : tn('doctor.actions.run')"
          icon="i-solar:stethoscope-bold-duotone"
          @click="runDoctor"
        />
        <Button
          variant="caution" size="sm"
          :loading="doctorFixing"
          :disabled="doctorRunning"
          :label="doctorFixing ? tn('doctor.actions.fixing') : tn('doctor.actions.fix')"
          icon="i-solar:wrench-bold-duotone"
          @click="fixDoctor"
        />
      </div>
    </div>

    <div v-if="doctorStats.total" class="flex items-center gap-3 text-xs">
      <span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
        PASS {{ doctorStats.pass }}
      </span>
      <span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-300">
        WARN {{ doctorStats.warn }}
      </span>
      <span class="rounded-full bg-red-500/15 px-2 py-0.5 text-red-700 dark:text-red-300">
        FAIL {{ doctorStats.fail }}
      </span>
      <span class="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-700 dark:text-sky-300">
        INFO {{ doctorStats.info }}
      </span>
    </div>

    <div v-if="doctorResults.length" class="flex flex-col gap-2">
      <article
        v-for="(result, idx) in doctorResults"
        :key="`${result.category}-${idx}`"
        class="flex flex-col gap-2 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] p-3"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex flex-col gap-0.5">
            <div class="flex items-center gap-2">
              <span class="rounded-full bg-neutral-200/60 px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {{ result.category }}
              </span>
              <span
                :class="[
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase',
                  DOCTOR_LEVEL_BADGE[result.level],
                ]"
              >
                {{ tn(`doctor.levels.${result.level}`) }}
              </span>
            </div>
            <div class="break-all text-xs text-neutral-700 dark:text-neutral-200">
              {{ result.detail }}
            </div>
            <div v-if="result.suggestion" class="text-xs text-neutral-500 dark:text-neutral-400">
              <span class="font-medium">{{ tn('doctor.suggestion-label') }}:</span> {{ result.suggestion }}
            </div>
          </div>
        </div>
      </article>
    </div>

    <TransitionVertical>
      <div v-if="fixResults.length" class="flex flex-col gap-2 border-t border-neutral-200/70 pt-3 dark:border-neutral-800">
        <div class="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {{ tn('doctor.actions.fix') }}
        </div>
        <article
          v-for="(result, idx) in fixResults"
          :key="`fix-${result.category}-${idx}`"
          class="flex flex-col gap-2 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] p-3"
        >
          <div class="flex items-center gap-2">
            <span class="rounded-full bg-neutral-200/60 px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {{ result.category }}
            </span>
            <span
              :class="[
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase',
                FIX_LEVEL_BADGE[result.level],
              ]"
            >
              {{ tn(`doctor.fix-levels.${result.level}`) }}
            </span>
          </div>
          <div class="break-all text-xs text-neutral-700 dark:text-neutral-200">
            {{ result.detail }}
          </div>
        </article>
      </div>
    </TransitionVertical>
  </section>
</template>
