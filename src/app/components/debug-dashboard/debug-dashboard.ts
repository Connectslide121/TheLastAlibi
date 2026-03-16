import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';

import { CasePackage, Clue } from '../../models';
import {
  DebugAiRequestRecord,
  DebugImageRecord,
  DebugTraceService,
} from '../../services/debug-trace.service';
import { PuzzleFrameComponent } from '../puzzle-frame/puzzle-frame';

type DebugTab = 'requests' | 'images' | 'puzzles' | 'case-data';
type CaseDataSection = 'metadata' | 'truth' | 'suspects' | 'locations' | 'clues' | 'events' | 'timeline' | 'puzzles-data';

type PuzzleDebugEntry = {
  puzzleId: string;
  title: string;
  description: string;
  rewardClue: Clue | null;
  eventTitle: string;
  conceptRequest: DebugAiRequestRecord | null;
  htmlRequest: DebugAiRequestRecord | null;
};

type RequestStatusTone = {
  background: string;
  color: string;
};

@Component({
  selector: 'app-debug-dashboard',
  imports: [DatePipe, PuzzleFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'fixed inset-0 z-[120] block',
    '(document:keydown.escape)': 'closePanel()',
  },
  template: `
    <div class="absolute inset-0 bg-black/75" (click)="closePanel()"></div>

    <section
      class="absolute inset-x-4 top-4 bottom-4 overflow-hidden rounded-2xl border flex flex-col"
      style="background: var(--color-secondary); border-color: rgba(201,168,76,0.28); box-shadow: var(--shadow-style)"
      (click)="$event.stopPropagation()"
      aria-label="Debug dashboard"
    >
      <header
        class="px-6 py-4 flex items-center gap-4 shrink-0"
        style="border-bottom: var(--border-style); background: linear-gradient(135deg, rgba(201,168,76,0.14), rgba(0,0,0,0))"
      >
        <div class="flex-1 min-w-0">
          <p
            class="font-mono text-xs uppercase tracking-[0.3em]"
            style="color: var(--color-text-muted)"
          >
            Internal Tools
          </p>
          <h2 class="font-heading text-2xl truncate" style="color: var(--color-accent)">
            Debug Dashboard
          </h2>
          <p class="text-sm mt-1 truncate" style="color: var(--color-text-muted)">
            {{ casePackage().metadata.title }}
          </p>
        </div>

        <button
          type="button"
          (click)="closePanel()"
          class="p-2 rounded-lg cursor-pointer transition-opacity hover:opacity-80"
          style="border: var(--border-style); color: var(--color-text)"
          aria-label="Close debug dashboard"
        >
          <span class="material-icons">close</span>
        </button>
      </header>

      <div
        class="px-6 pt-4 shrink-0 flex flex-wrap gap-2"
        style="border-bottom: var(--border-style)"
      >
        @for (tab of tabs; track tab.id) {
          <button
            type="button"
            (click)="activeTab.set(tab.id)"
            class="px-4 py-2 rounded-t-lg font-mono text-xs uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2"
            [style.background]="activeTab() === tab.id ? 'var(--color-surface)' : 'transparent'"
            [style.color]="
              activeTab() === tab.id ? 'var(--color-accent)' : 'var(--color-text-muted)'
            "
            [style.border]="
              activeTab() === tab.id ? 'var(--border-style)' : '1px solid transparent'
            "
            [style.border-bottom-color]="activeTab() === tab.id ? 'transparent' : 'transparent'"
          >
            <span>{{ tab.label }}</span>
            <span
              class="inline-flex min-w-6 h-6 px-2 items-center justify-center rounded-full font-mono text-[10px]"
              [style.background]="
                activeTab() === tab.id ? 'rgba(201,168,76,0.16)' : 'rgba(0,0,0,0.22)'
              "
              [style.color]="
                activeTab() === tab.id ? 'var(--color-accent)' : 'var(--color-text-muted)'
              "
            >
              @if (tabCount(tab.id) !== null) {
                {{ tabCount(tab.id) }}
              }
            </span>
          </button>
        }
      </div>

      <div class="flex-1 min-h-0 overflow-hidden">
        @if (activeTab() === 'requests') {
          <div class="h-full overflow-y-auto px-6 py-5">
            @if (sortedRequests().length === 0) {
              <p class="text-sm italic" style="color: var(--color-text-muted)">
                No AI requests captured yet.
              </p>
            }
            <div class="flex flex-col gap-2">
              @for (request of sortedRequests(); track request.id) {
                <button
                  type="button"
                  class="w-full text-left rounded-xl border px-4 py-3 cursor-pointer transition-opacity hover:opacity-85"
                  style="background: var(--color-surface); border-color: rgba(201,168,76,0.16)"
                  (click)="selectedRequestId.set(request.id)"
                >
                  <div class="flex items-center gap-3">
                    <span
                      class="inline-flex px-2 py-1 rounded-full font-mono text-[10px] uppercase tracking-widest shrink-0"
                      [style.background]="requestStatusTone(request).background"
                      [style.color]="requestStatusTone(request).color"
                    >
                      {{ request.status }}
                    </span>
                    <div class="flex-1 min-w-0">
                      <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span class="font-heading text-sm" style="color: var(--color-accent)">
                          {{ request.meta?.label ?? request.path }}
                        </span>
                        @if (request.meta?.category) {
                          <span
                            class="font-mono text-[10px] uppercase tracking-widest"
                            style="color: var(--color-text-muted)"
                          >
                            {{ requestCategoryLabel(request) }}
                          </span>
                        }
                      </div>
                      <p class="text-xs truncate mt-0.5" style="color: var(--color-text-muted)">
                        {{ snippet(request.payload.prompt, 100) }}
                      </p>
                    </div>
                    <div class="shrink-0 flex flex-col items-end gap-0.5">
                      @if (request.completedAt) {
                        <p class="font-mono text-[10px]" style="color: var(--color-text-muted)">
                          {{ requestDurationLabel(request) }}
                        </p>
                      }
                      <span class="material-icons text-sm" style="color: var(--color-text-muted)"
                        >chevron_right</span
                      >
                    </div>
                  </div>
                </button>
              }
            </div>
          </div>
        }

        @if (activeTab() === 'images') {
          <div class="h-full overflow-y-auto px-6 py-5">
            @if (sortedImages().length === 0) {
              <p class="text-sm italic" style="color: var(--color-text-muted)">
                No image generation attempts captured yet.
              </p>
            }
            <div
              class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3"
            >
              @for (image of sortedImages(); track image.id) {
                <button
                  type="button"
                  (click)="selectedImageId.set(image.id)"
                  class="text-left rounded-xl border overflow-hidden cursor-pointer transition-opacity hover:opacity-85"
                  style="background: var(--color-surface); border-color: rgba(201,168,76,0.16)"
                >
                  @if (image.outputUrl) {
                    <img
                      [src]="image.outputUrl"
                      [alt]="image.entityId"
                      class="w-full h-32 object-cover"
                    />
                  } @else {
                    <div
                      class="w-full h-32 flex items-center justify-center"
                      style="background: rgba(0,0,0,0.2)"
                    >
                      <span class="material-icons" style="color: var(--color-text-muted)"
                        >image</span
                      >
                    </div>
                  }
                  <div class="px-3 py-2">
                    <div class="flex items-center justify-between gap-1">
                      <p
                        class="font-mono text-[10px] truncate"
                        style="color: var(--color-text-muted)"
                      >
                        {{ image.entityType }}
                      </p>
                      <span
                        class="inline-flex px-1.5 py-0.5 rounded-full font-mono text-[9px] uppercase tracking-widest shrink-0"
                        [style.background]="statusBackground(image)"
                        [style.color]="statusColor(image)"
                      >
                        {{ image.status }}
                      </span>
                    </div>
                    <p class="text-xs truncate mt-0.5" style="color: var(--color-accent)">
                      {{ image.entityId }}
                    </p>
                  </div>
                </button>
              }
            </div>
          </div>
        }

        @if (activeTab() === 'case-data') {
          <!-- Case Data Explorer -->
          <div class="h-full grid grid-cols-[14rem_minmax(0,1fr)] min-h-0">
            <!-- Section nav -->
            <aside class="overflow-y-auto py-4 flex flex-col gap-1 px-3" style="border-right: var(--border-style)">
              @for (sec of caseDataSections; track sec.id) {
                <button
                  type="button"
                  (click)="caseDataSection.set(sec.id)"
                  class="w-full text-left px-3 py-2 rounded-lg text-sm cursor-pointer transition-opacity hover:opacity-85"
                  [style.background]="caseDataSection() === sec.id ? 'rgba(201,168,76,0.12)' : 'transparent'"
                  [style.color]="caseDataSection() === sec.id ? 'var(--color-accent)' : 'var(--color-text)'"
                >
                  {{ sec.label }}
                  <span class="font-mono text-[10px]" style="color: var(--color-text-muted)"> {{ sec.count() }}</span>
                </button>
              }
            </aside>

            <!-- Section content -->
            <div class="h-full min-h-0 overflow-y-auto px-6 py-5 flex flex-col gap-5">

              <!-- METADATA -->
              @if (caseDataSection() === 'metadata') {
                @let m = casePackage().metadata;
                <h3 class="font-heading text-xl" style="color: var(--color-accent)">Case Metadata</h3>
                <div class="rounded-xl p-4 flex flex-col gap-3" style="background: var(--color-surface); border: var(--border-style)">
                  @for (row of [
                    { label: 'Title', value: m.title },
                    { label: 'Subtitle', value: m.subtitle },
                    { label: 'Type', value: m.caseType },
                    { label: 'Difficulty', value: m.difficulty },
                    { label: 'Setting', value: m.setting }
                  ]; track row.label) {
                    <div>
                      <p class="font-mono text-[10px] uppercase tracking-widest" style="color: var(--color-text-muted)">{{ row.label }}</p>
                      <p class="text-sm mt-0.5" style="color: var(--color-text)">{{ row.value }}</p>
                    </div>
                  }
                  <div>
                    <p class="font-mono text-[10px] uppercase tracking-widest mb-1" style="color: var(--color-text-muted)">Briefing</p>
                    <p class="text-sm whitespace-pre-wrap" style="color: var(--color-text)">{{ m.briefing }}</p>
                  </div>
                  <div>
                    <p class="font-mono text-[10px] uppercase tracking-widest mb-1" style="color: var(--color-text-muted)">Act I Summary</p>
                    <p class="text-sm" style="color: var(--color-text)">{{ m.act1Summary }}</p>
                  </div>
                  <div>
                    <p class="font-mono text-[10px] uppercase tracking-widest mb-1" style="color: var(--color-text-muted)">Act II Summary</p>
                    <p class="text-sm" style="color: var(--color-text)">{{ m.act2Summary }}</p>
                  </div>
                  <div>
                    <p class="font-mono text-[10px] uppercase tracking-widest mb-1" style="color: var(--color-text-muted)">Act III Summary</p>
                    <p class="text-sm" style="color: var(--color-text)">{{ m.act3Summary }}</p>
                  </div>
                </div>
              }

              <!-- TRUTH -->
              @if (caseDataSection() === 'truth') {
                @let t = casePackage().truth;
                @let sx = casePackage().solutionExplanation;
                <h3 class="font-heading text-xl" style="color: var(--color-accent)">Truth Layer</h3>
                <div class="rounded-xl p-4 flex flex-col gap-3" style="background: var(--color-surface); border: var(--border-style)">
                  @for (row of [
                    { label: 'Culprit ID', value: t.culpritId },
                    { label: 'Motive', value: t.motive },
                    { label: 'Method', value: t.method },
                    { label: 'Key Contradiction', value: t.keyContradiction },
                    { label: 'Red Herring Explanation', value: t.redHerringExplanation },
                    { label: 'True Timeline', value: t.trueTimeline }
                  ]; track row.label) {
                    <div>
                      <p class="font-mono text-[10px] uppercase tracking-widest" style="color: var(--color-text-muted)">{{ row.label }}</p>
                      <p class="text-sm mt-0.5 whitespace-pre-wrap" style="color: var(--color-text)">{{ row.value }}</p>
                    </div>
                  }
                  <div>
                    <p class="font-mono text-[10px] uppercase tracking-widest mb-1" style="color: var(--color-text-muted)">Lying Suspects</p>
                    <p class="text-sm font-mono" style="color: var(--color-text)">{{ t.lyingSuspectIds.join(', ') || 'none' }}</p>
                  </div>
                  <div>
                    <p class="font-mono text-[10px] uppercase tracking-widest mb-1" style="color: var(--color-text-muted)">Mistaken Suspects</p>
                    <p class="text-sm font-mono" style="color: var(--color-text)">{{ t.mistakenSuspectIds.join(', ') || 'none' }}</p>
                  </div>
                  <div>
                    <p class="font-mono text-[10px] uppercase tracking-widest mb-1" style="color: var(--color-text-muted)">Hiding Secret</p>
                    <p class="text-sm font-mono" style="color: var(--color-text)">{{ t.hidingSecretSuspectIds.join(', ') || 'none' }}</p>
                  </div>
                  <div>
                    <p class="font-mono text-[10px] uppercase tracking-widest mb-1" style="color: var(--color-text-muted)">Revealing Clues</p>
                    <p class="text-sm font-mono" style="color: var(--color-text)">{{ t.revealingClueIds.join(', ') || 'none' }}</p>
                  </div>
                  <div>
                    <p class="font-mono text-[10px] uppercase tracking-widest mb-1" style="color: var(--color-text-muted)">Red Herring Clues</p>
                    <p class="text-sm font-mono" style="color: var(--color-text)">{{ t.redHerringClueIds.join(', ') || 'none' }}</p>
                  </div>
                  <div>
                    <p class="font-mono text-[10px] uppercase tracking-widest mb-1" style="color: var(--color-text-muted)">Solution Narrative</p>
                    <p class="text-sm whitespace-pre-wrap" style="color: var(--color-text)">{{ sx.narrative }}</p>
                  </div>
                  @if (sx.stepsExplained.length) {
                    <div>
                      <p class="font-mono text-[10px] uppercase tracking-widest mb-1" style="color: var(--color-text-muted)">Steps Explained</p>
                      <ol class="list-decimal pl-5 flex flex-col gap-1">
                        @for (step of sx.stepsExplained; track $index) {
                          <li class="text-sm" style="color: var(--color-text)">{{ step }}</li>
                        }
                      </ol>
                    </div>
                  }
                </div>
              }

              <!-- SUSPECTS -->
              @if (caseDataSection() === 'suspects') {
                <h3 class="font-heading text-xl" style="color: var(--color-accent)">Suspects</h3>
                <div class="grid grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)] gap-4 min-h-0">
                  <div class="flex flex-col gap-2">
                    @for (suspect of casePackage().suspects; track suspect.id) {
                      <button
                        type="button"
                        (click)="selectedSuspectId.set(suspect.id)"
                        class="text-left rounded-xl border px-4 py-3 cursor-pointer transition-opacity hover:opacity-85"
                        [style.background]="selectedSuspectId() === suspect.id ? 'rgba(201,168,76,0.12)' : 'var(--color-surface)'"
                        [style.border-color]="selectedSuspectId() === suspect.id ? 'rgba(201,168,76,0.45)' : 'rgba(201,168,76,0.16)'"
                      >
                        @if (suspect.imageUrl) {
                          <img [src]="suspect.imageUrl" [alt]="suspect.name" class="w-full h-24 object-cover rounded-lg mb-2" />
                        }
                        <p class="font-heading text-sm" style="color: var(--color-accent)">{{ suspect.name }}</p>
                        <p class="font-mono text-[10px]" style="color: var(--color-text-muted)">{{ suspect.occupation }}</p>
                        @if (casePackage().truth.culpritId === suspect.id) {
                          <span class="inline-flex mt-1 px-2 py-0.5 rounded-full font-mono text-[9px] uppercase tracking-widest" style="background: rgba(239,68,68,0.18); color: rgb(252,165,165)">CULPRIT</span>
                        }
                      </button>
                    }
                  </div>
                  @if (selectedSuspect(); as s) {
                    <div class="rounded-xl p-4 flex flex-col gap-3" style="background: var(--color-surface); border: var(--border-style)">
                      <div class="flex items-start gap-4">
                        @if (s.imageUrl) {
                          <button type="button" (click)="lightboxUrl.set(s.imageUrl!)" class="block w-28 h-28 rounded-xl overflow-hidden cursor-zoom-in shrink-0 hover:opacity-85 transition-opacity">
                            <img [src]="s.imageUrl" [alt]="s.name" class="w-full h-full object-cover" />
                          </button>
                        }
                        <div class="flex flex-col gap-1 min-w-0">
                          <p class="font-heading text-xl" style="color: var(--color-accent)">{{ s.name }}</p>
                          <p class="text-sm" style="color: var(--color-text-muted)">{{ s.occupation }}, age {{ s.age }}</p>
                          <div class="flex flex-wrap gap-1 mt-1">
                            @if (s.isLying) { <span class="px-2 py-0.5 rounded-full font-mono text-[9px] uppercase" style="background: rgba(239,68,68,0.18); color: rgb(252,165,165)">Lying</span> }
                            @if (s.isMistaken) { <span class="px-2 py-0.5 rounded-full font-mono text-[9px] uppercase" style="background: rgba(250,204,21,0.14); color: rgb(253,224,71)">Mistaken</span> }
                            @if (s.isHidingSecret) { <span class="px-2 py-0.5 rounded-full font-mono text-[9px] uppercase" style="background: rgba(139,92,246,0.18); color: rgb(196,181,253)">Hiding Secret</span> }
                          </div>
                        </div>
                      </div>
                      @for (row of [
                        { label: 'Relationship', value: s.relationship },
                        { label: 'Description', value: s.description },
                        { label: 'Personality', value: s.personality },
                        { label: 'Alibi', value: s.alibi },
                        { label: 'Secret (unrelated to case)', value: s.secretUnrelatedToCase }
                      ]; track row.label) {
                        <div>
                          <p class="font-mono text-[10px] uppercase tracking-widest" style="color: var(--color-text-muted)">{{ row.label }}</p>
                          <p class="text-sm mt-0.5" style="color: var(--color-text)">{{ row.value }}</p>
                        </div>
                      }
                      @if (s.interviewDialogue.length) {
                        <div>
                          <p class="font-mono text-[10px] uppercase tracking-widest mb-2" style="color: var(--color-text-muted)">Interview Dialogue ({{ s.interviewDialogue.length }} lines)</p>
                          <div class="flex flex-col gap-2 max-h-64 overflow-y-auto">
                            @for (line of s.interviewDialogue; track $index) {
                              <div class="rounded-lg px-3 py-2 text-sm"
                                [style.background]="line.speakerId === 'detective' ? 'rgba(201,168,76,0.1)' : 'rgba(0,0,0,0.2)'"
                                [style.color]="line.revealsTruth ? 'rgb(134,239,172)' : 'var(--color-text)'"
                              >
                                <div class="flex items-center gap-2 flex-wrap mb-0.5">
                                  <span class="font-mono text-[10px] uppercase tracking-widest" style="color: var(--color-text-muted)">{{ line.speakerName }}</span>
                                  @if (line.revealsTruth) {
                                    <span class="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-full" style="background: rgba(34,197,94,0.18); color: rgb(134,239,172)">reveals truth</span>
                                  }
                                </div>
                                {{ line.text }}
                              </div>
                            }
                          </div>
                        </div>
                      }
                    </div>
                  } @else {
                    <p class="text-sm italic" style="color: var(--color-text-muted)">Select a suspect to see all properties.</p>
                  }
                </div>
              }

              <!-- LOCATIONS -->
              @if (caseDataSection() === 'locations') {
                <h3 class="font-heading text-xl" style="color: var(--color-accent)">Locations</h3>
                <div class="grid grid-cols-1 lg:grid-cols-[14rem_minmax(0,1fr)] gap-4">
                  <div class="flex flex-col gap-2">
                    @for (loc of casePackage().locations; track loc.id) {
                      <button
                        type="button"
                        (click)="selectedLocationId.set(loc.id)"
                        class="text-left rounded-xl border px-4 py-3 cursor-pointer transition-opacity hover:opacity-85"
                        [style.background]="selectedLocationId() === loc.id ? 'rgba(201,168,76,0.12)' : 'var(--color-surface)'"
                        [style.border-color]="selectedLocationId() === loc.id ? 'rgba(201,168,76,0.45)' : 'rgba(201,168,76,0.16)'"
                      >
                        @if (loc.imageUrl) {
                          <img [src]="loc.imageUrl" [alt]="loc.name" class="w-full h-24 object-cover rounded-lg mb-2" />
                        } @else {
                          <div class="w-full h-24 rounded-lg mb-2 flex items-center justify-center" style="background: rgba(0,0,0,0.2)">
                            <span class="material-icons" style="color: var(--color-text-muted); font-size: 2rem">location_city</span>
                          </div>
                        }
                        <p class="font-heading text-sm" style="color: var(--color-accent)">{{ loc.name }}</p>
                        <p class="font-mono text-[10px]" style="color: var(--color-text-muted)">{{ loc.cluesFoundHere.length }} clue(s)</p>
                      </button>
                    }
                  </div>
                  @if (selectedLocation(); as loc) {
                    <div class="rounded-xl p-4 flex flex-col gap-3" style="background: var(--color-surface); border: var(--border-style)">
                      @if (loc.imageUrl) {
                        <button type="button" (click)="lightboxUrl.set(loc.imageUrl!)" class="block w-28 h-28 rounded-xl overflow-hidden cursor-zoom-in shrink-0 hover:opacity-85 transition-opacity">
                          <img [src]="loc.imageUrl" [alt]="loc.name" class="w-full h-full object-cover" />
                        </button>
                      }
                      <p class="font-heading text-xl" style="color: var(--color-accent)">{{ loc.name }}</p>
                      @for (row of [
                        { label: 'ID', value: loc.id },
                        { label: 'Description', value: loc.description },
                        { label: 'Atmosphere', value: loc.atmosphere }
                      ]; track row.label) {
                        <div>
                          <p class="font-mono text-[10px] uppercase tracking-widest" style="color: var(--color-text-muted)">{{ row.label }}</p>
                          <p class="text-sm mt-0.5" style="color: var(--color-text)">{{ row.value }}</p>
                        </div>
                      }
                      <div>
                        <p class="font-mono text-[10px] uppercase tracking-widest mb-1" style="color: var(--color-text-muted)">Clues Found Here</p>
                        @for (clueId of loc.cluesFoundHere; track clueId) {
                          <p class="text-sm font-mono" style="color: var(--color-text)">{{ clueId }}</p>
                        }
                      </div>
                      <div>
                        <p class="font-mono text-[10px] uppercase tracking-widest" style="color: var(--color-text-muted)">Image Prompt</p>
                        <p class="text-xs mt-0.5 whitespace-pre-wrap" style="color: var(--color-text-muted)">{{ loc.imagePrompt }}</p>
                      </div>
                    </div>
                  } @else {
                    <p class="text-sm italic" style="color: var(--color-text-muted)">Select a location to see all properties.</p>
                  }
                </div>
              }

              <!-- CLUES -->
              @if (caseDataSection() === 'clues') {
                <h3 class="font-heading text-xl" style="color: var(--color-accent)">Clues</h3>
                <div class="grid grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)] gap-4">
                  <div class="flex flex-col gap-2">
                    @for (clue of casePackage().clues; track clue.id) {
                      <button
                        type="button"
                        (click)="selectedClueId.set(clue.id)"
                        class="text-left rounded-xl border px-4 py-3 cursor-pointer transition-opacity hover:opacity-85"
                        [style.background]="selectedClueId() === clue.id ? 'rgba(201,168,76,0.12)' : 'var(--color-surface)'"
                        [style.border-color]="selectedClueId() === clue.id ? 'rgba(201,168,76,0.45)' : 'rgba(201,168,76,0.16)'"
                      >
                        @if (clue.imageUrl) {
                          <img [src]="clue.imageUrl" [alt]="clue.name" class="w-full h-24 object-cover rounded-lg mb-2" />
                        } @else {
                          <div class="w-full h-24 rounded-lg mb-2 flex items-center justify-center" style="background: rgba(0,0,0,0.2)">
                            <span class="material-icons" style="color: var(--color-text-muted); font-size: 2rem">search</span>
                          </div>
                        }
                        <p class="font-heading text-sm" style="color: var(--color-accent)">{{ clue.name }}</p>
                        <div class="flex gap-1 flex-wrap">
                          @if (clue.isRedHerring) {
                            <span class="px-1.5 py-0.5 rounded-full font-mono text-[9px] uppercase" style="background: rgba(239,68,68,0.18); color: rgb(252,165,165)">Red Herring</span>
                          }
                          <span class="font-mono text-[9px]" style="color: var(--color-text-muted)">{{ clue.locationId }}</span>
                        </div>
                      </button>
                    }
                  </div>
                  @if (selectedCaseClue(); as clue) {
                    <div class="rounded-xl p-4 flex flex-col gap-3" style="background: var(--color-surface); border: var(--border-style)">
                      @if (clue.imageUrl) {
                        <button type="button" (click)="lightboxUrl.set(clue.imageUrl!)" class="block w-28 h-28 rounded-xl overflow-hidden cursor-zoom-in shrink-0 hover:opacity-85 transition-opacity">
                          <img [src]="clue.imageUrl" [alt]="clue.name" class="w-full h-full object-cover" />
                        </button>
                      }
                      <div class="flex items-center gap-2 flex-wrap">
                        <p class="font-heading text-xl" style="color: var(--color-accent)">{{ clue.name }}</p>
                        @if (clue.isRedHerring) {
                          <span class="px-2 py-0.5 rounded-full font-mono text-[10px] uppercase" style="background: rgba(239,68,68,0.18); color: rgb(252,165,165)">Red Herring</span>
                        }
                      </div>
                      @for (row of [
                        { label: 'ID', value: clue.id },
                        { label: 'Location', value: clue.locationId },
                        { label: 'Description', value: clue.description },
                        { label: 'Reveals Info', value: clue.revealsInfo }
                      ]; track row.label) {
                        <div>
                          <p class="font-mono text-[10px] uppercase tracking-widest" style="color: var(--color-text-muted)">{{ row.label }}</p>
                          <p class="text-sm mt-0.5" style="color: var(--color-text)">{{ row.value }}</p>
                        </div>
                      }
                      <div>
                        <p class="font-mono text-[10px] uppercase tracking-widest" style="color: var(--color-text-muted)">Image Prompt</p>
                        <p class="text-xs mt-0.5 whitespace-pre-wrap" style="color: var(--color-text-muted)">{{ clue.imagePrompt }}</p>
                      </div>
                    </div>
                  } @else {
                    <p class="text-sm italic" style="color: var(--color-text-muted)">Select a clue to see all properties.</p>
                  }
                </div>
              }

              <!-- EVENTS -->
              @if (caseDataSection() === 'events') {
                <h3 class="font-heading text-xl" style="color: var(--color-accent)">Investigation Events</h3>
                <div class="grid grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)] gap-4">
                  <div class="flex flex-col gap-2">
                    @for (event of casePackage().eventGraph; track event.id) {
                      <button
                        type="button"
                        (click)="selectedEventId.set(event.id)"
                        class="text-left rounded-xl border px-4 py-3 cursor-pointer transition-opacity hover:opacity-85"
                        [style.background]="selectedEventId() === event.id ? 'rgba(201,168,76,0.12)' : 'var(--color-surface)'"
                        [style.border-color]="selectedEventId() === event.id ? 'rgba(201,168,76,0.45)' : 'rgba(201,168,76,0.16)'"
                      >
                        <div class="flex items-center gap-2">
                          <span class="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-full" style="background: rgba(0,0,0,0.25); color: var(--color-text-muted)">Act {{ event.act }}</span>
                          @if (event.isMandatory) {
                            <span class="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-full" style="background: rgba(201,168,76,0.12); color: var(--color-accent)">Required</span>
                          }
                        </div>
                        <p class="font-heading text-sm mt-1" style="color: var(--color-accent)">{{ event.title }}</p>
                        <p class="font-mono text-[9px] mt-0.5" style="color: var(--color-text-muted)">{{ event.category }} / {{ event.type }}</p>
                      </button>
                    }
                  </div>
                  @if (selectedCaseEvent(); as ev) {
                    <div class="rounded-xl p-4 flex flex-col gap-3" style="background: var(--color-surface); border: var(--border-style)">
                      <div class="flex flex-wrap gap-2 items-center">
                        <span class="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full" style="background: rgba(0,0,0,0.25); color: var(--color-text-muted)">Act {{ ev.act }}</span>
                        <span class="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full" style="background: rgba(0,0,0,0.2); color: var(--color-text-muted)">{{ ev.category }}</span>
                        @if (ev.isMandatory) {
                          <span class="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full" style="background: rgba(201,168,76,0.12); color: var(--color-accent)">Required</span>
                        }
                      </div>
                      <p class="font-heading text-xl" style="color: var(--color-accent)">{{ ev.title }}</p>
                      @for (row of [
                        { label: 'ID', value: ev.id },
                        { label: 'Type', value: ev.type },
                        { label: 'Description', value: ev.description },
                        { label: 'Narration', value: ev.narration }
                      ]; track row.label) {
                        <div>
                          <p class="font-mono text-[10px] uppercase tracking-widest" style="color: var(--color-text-muted)">{{ row.label }}</p>
                          <p class="text-sm mt-0.5 whitespace-pre-wrap" style="color: var(--color-text)">{{ row.value }}</p>
                        </div>
                      }
                      @if (ev.rewardsClueIds.length) {
                        <div>
                          <p class="font-mono text-[10px] uppercase tracking-widest mb-1" style="color: var(--color-text-muted)">Rewards Clues</p>
                          @for (id of ev.rewardsClueIds; track id) {
                            <p class="text-sm font-mono" style="color: var(--color-text)">{{ id }}</p>
                          }
                        </div>
                      }
                      @if (ev.unlocksSuspectIds.length) {
                        <div>
                          <p class="font-mono text-[10px] uppercase tracking-widest mb-1" style="color: var(--color-text-muted)">Unlocks Suspects</p>
                          @for (id of ev.unlocksSuspectIds; track id) {
                            <p class="text-sm font-mono" style="color: var(--color-text)">{{ id }}</p>
                          }
                        </div>
                      }
                      @if (ev.puzzleId) {
                        <div>
                          <p class="font-mono text-[10px] uppercase tracking-widest" style="color: var(--color-text-muted)">Puzzle ID</p>
                          <p class="text-sm font-mono mt-0.5" style="color: var(--color-text)">{{ ev.puzzleId }}</p>
                        </div>
                      }
                      @if (ev.dialogueSuspectId) {
                        <div>
                          <p class="font-mono text-[10px] uppercase tracking-widest" style="color: var(--color-text-muted)">Dialogue Suspect</p>
                          <p class="text-sm font-mono mt-0.5" style="color: var(--color-text)">{{ ev.dialogueSuspectId }}</p>
                        </div>
                      }
                      @if (ev.unlockConditions.length) {
                        <div>
                          <p class="font-mono text-[10px] uppercase tracking-widest mb-1" style="color: var(--color-text-muted)">Unlock Conditions</p>
                          @for (c of ev.unlockConditions; track $index) {
                            <p class="text-sm font-mono" style="color: var(--color-text)">{{ c.type }}: {{ c.referenceId }}</p>
                          }
                        </div>
                      }
                    </div>
                  } @else {
                    <p class="text-sm italic" style="color: var(--color-text-muted)">Select an event to see all properties.</p>
                  }
                </div>
              }

              <!-- TIMELINE -->
              @if (caseDataSection() === 'timeline') {
                <h3 class="font-heading text-xl" style="color: var(--color-accent)">Timeline</h3>
                <div class="flex flex-col gap-3">
                  @for (entry of casePackage().timeline; track entry.id) {
                    <div
                      class="rounded-xl px-4 py-3 flex gap-4"
                      style="background: var(--color-surface); border: var(--border-style)"
                      [style.border-left-color]="entry.isTrue ? 'rgb(134,239,172)' : 'rgb(252,165,165)'"
                      [style.border-left-width]="'3px'"
                    >
                      <div class="shrink-0 pt-0.5">
                        <span
                          class="inline-flex px-2 py-0.5 rounded-full font-mono text-[10px] uppercase"
                          [style.background]="entry.isTrue ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)'"
                          [style.color]="entry.isTrue ? 'rgb(134,239,172)' : 'rgb(252,165,165)'"
                        >{{ entry.isTrue ? 'True' : 'False' }}</span>
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="font-mono text-xs" style="color: var(--color-accent)">{{ entry.time }}</p>
                        <p class="text-sm mt-1" style="color: var(--color-text)">{{ entry.description }}</p>
                        @if (entry.involvedSuspectIds.length) {
                          <p class="font-mono text-[10px] mt-1" style="color: var(--color-text-muted)">Suspects: {{ entry.involvedSuspectIds.join(', ') }}</p>
                        }
                      </div>
                    </div>
                  }
                </div>
              }

              <!-- PUZZLES DATA -->
              @if (caseDataSection() === 'puzzles-data') {
                <h3 class="font-heading text-xl" style="color: var(--color-accent)">Puzzles</h3>
                <div class="grid grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)] gap-4">
                  <div class="flex flex-col gap-2">
                    @for (puzzle of casePackage().puzzles; track puzzle.id) {
                      <button
                        type="button"
                        (click)="selectedCasePuzzleId.set(puzzle.id)"
                        class="text-left rounded-xl border px-4 py-3 cursor-pointer transition-opacity hover:opacity-85"
                        [style.background]="selectedCasePuzzleId() === puzzle.id ? 'rgba(201,168,76,0.12)' : 'var(--color-surface)'"
                        [style.border-color]="selectedCasePuzzleId() === puzzle.id ? 'rgba(201,168,76,0.45)' : 'rgba(201,168,76,0.16)'"
                      >
                        <p class="font-mono text-[10px] uppercase tracking-widest" style="color: var(--color-text-muted)">{{ puzzle.type }}</p>
                        <p class="font-heading text-sm mt-0.5" style="color: var(--color-accent)">{{ puzzle.title }}</p>
                      </button>
                    }
                  </div>
                  @if (selectedCasePuzzle(); as puzzle) {
                    <div class="rounded-xl p-4 flex flex-col gap-3" style="background: var(--color-surface); border: var(--border-style)">
                      <div>
                        <span class="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full" style="background: rgba(0,0,0,0.25); color: var(--color-text-muted)">{{ puzzle.type }}</span>
                      </div>
                      <p class="font-heading text-xl" style="color: var(--color-accent)">{{ puzzle.title }}</p>
                      @for (row of [
                        { label: 'ID', value: puzzle.id },
                        { label: 'Description', value: puzzle.description },
                        { label: 'Solution Condition', value: puzzle.solutionCondition },
                        { label: 'Rewarded Clue ID', value: puzzle.rewardedClueId }
                      ]; track row.label) {
                        <div>
                          <p class="font-mono text-[10px] uppercase tracking-widest" style="color: var(--color-text-muted)">{{ row.label }}</p>
                          <p class="text-sm mt-0.5 whitespace-pre-wrap" style="color: var(--color-text)">{{ row.value }}</p>
                        </div>
                      }
                      @if (puzzle.hints.length) {
                        <div>
                          <p class="font-mono text-[10px] uppercase tracking-widest mb-1" style="color: var(--color-text-muted)">Hints</p>
                          <ol class="list-decimal pl-5 flex flex-col gap-1">
                            @for (hint of puzzle.hints; track $index) {
                              <li class="text-sm" style="color: var(--color-text)">{{ hint }}</li>
                            }
                          </ol>
                        </div>
                      }
                    </div>
                  } @else {
                    <p class="text-sm italic" style="color: var(--color-text-muted)">Select a puzzle to see all properties.</p>
                  }
                </div>
              }

            </div>
          </div>
        }

        @if (activeTab() === 'puzzles') {
          <div class="h-full grid grid-cols-1 xl:grid-cols-[22rem_minmax(0,1fr)] min-h-0">
            <aside
              class="overflow-y-auto px-6 py-5 flex flex-col gap-3"
              style="border-right: var(--border-style)"
            >
              @if (puzzleEntries().length === 0) {
                <p class="text-sm italic" style="color: var(--color-text-muted)">
                  No puzzles are available for this case.
                </p>
              }
              @for (entry of puzzleEntries(); track entry.puzzleId) {
                <button
                  type="button"
                  (click)="selectedPuzzleId.set(entry.puzzleId); previewMessage.set('')"
                  class="text-left rounded-xl p-4 border cursor-pointer transition-opacity hover:opacity-85"
                  [style.background]="
                    selectedPuzzleId() === entry.puzzleId
                      ? 'rgba(201,168,76,0.12)'
                      : 'var(--color-surface)'
                  "
                  [style.border-color]="
                    selectedPuzzleId() === entry.puzzleId
                      ? 'rgba(201,168,76,0.45)'
                      : 'rgba(201,168,76,0.16)'
                  "
                >
                  <p
                    class="font-mono text-[10px] uppercase tracking-widest"
                    style="color: var(--color-text-muted)"
                  >
                    {{ entry.puzzleId }}
                  </p>
                  <h3 class="font-heading text-lg mt-1" style="color: var(--color-accent)">
                    {{ entry.title }}
                  </h3>
                  <p class="text-sm mt-2" style="color: var(--color-text)">
                    {{ entry.description }}
                  </p>
                  <p class="text-xs mt-3" style="color: var(--color-text-muted)">
                    Event: {{ entry.eventTitle }}
                  </p>
                </button>
              }
            </aside>

            <div class="min-h-0 h-full overflow-hidden px-6 py-5 flex flex-col gap-5">
              @if (selectedPuzzleEntry(); as entry) {
                <div
                  class="grid grid-cols-1 2xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] gap-5 min-h-0 flex-1 overflow-hidden"
                >
                  <div class="min-h-0 overflow-y-auto flex flex-col gap-4 pr-1">
                    <!-- Game Data panel -->
                    @if (selectedPuzzle(); as puzzle) {
                      <div
                        class="rounded-xl p-4"
                        style="background: var(--color-surface); border: var(--border-style)"
                      >
                        <p
                          class="font-mono text-[10px] uppercase tracking-widest mb-3"
                          style="color: var(--color-accent)"
                        >
                          Game Data
                        </p>
                        <div class="flex flex-col gap-3 text-sm">
                          <div>
                            <p
                              class="font-mono text-[10px] uppercase tracking-widest mb-0.5"
                              style="color: var(--color-text-muted)"
                            >
                              Type
                            </p>
                            <p style="color: var(--color-text)">{{ puzzle.type }}</p>
                          </div>
                          <div>
                            <p
                              class="font-mono text-[10px] uppercase tracking-widest mb-0.5"
                              style="color: var(--color-text-muted)"
                            >
                              Description
                            </p>
                            <p style="color: var(--color-text)">{{ puzzle.description }}</p>
                          </div>
                          @if (puzzle.hints.length) {
                            <div>
                              <p
                                class="font-mono text-[10px] uppercase tracking-widest mb-1"
                                style="color: var(--color-text-muted)"
                              >
                                Hints
                              </p>
                              <ul class="flex flex-col gap-1 list-disc pl-4">
                                @for (hint of puzzle.hints; track $index) {
                                  <li style="color: var(--color-text)">{{ hint }}</li>
                                }
                              </ul>
                            </div>
                          }
                          <div>
                            <p
                              class="font-mono text-[10px] uppercase tracking-widest mb-0.5"
                              style="color: var(--color-text-muted)"
                            >
                              Solution Condition
                            </p>
                            <p style="color: var(--color-text)">{{ puzzle.solutionCondition }}</p>
                          </div>
                          @if (entry.rewardClue) {
                            <div>
                              <p
                                class="font-mono text-[10px] uppercase tracking-widest mb-0.5"
                                style="color: var(--color-text-muted)"
                              >
                                Reward Clue
                              </p>
                              <p class="font-semibold" style="color: var(--color-accent)">
                                {{ entry.rewardClue.name }}
                              </p>
                              <p class="text-xs mt-0.5" style="color: var(--color-text-muted)">
                                {{ entry.rewardClue.description }}
                              </p>
                            </div>
                          }
                        </div>
                      </div>
                    }

                    <div
                      class="rounded-xl p-4"
                      style="background: var(--color-surface); border: var(--border-style)"
                    >
                      <p
                        class="font-mono text-[10px] uppercase tracking-widest mb-3"
                        style="color: var(--color-accent)"
                      >
                        Puzzle Idea Request
                      </p>
                      @if (entry.conceptRequest) {
                        <pre
                          class="text-xs whitespace-pre-wrap wrap-break-word max-h-72 overflow-auto"
                          style="color: var(--color-text)"
                          >{{ entry.conceptRequest.payload.prompt }}</pre
                        >
                        <div class="mt-4 pt-4" style="border-top: var(--border-style)">
                          <p
                            class="font-mono text-[10px] uppercase tracking-widest mb-2"
                            style="color: var(--color-accent)"
                          >
                            Response
                          </p>
                          <pre
                            class="text-xs whitespace-pre-wrap wrap-break-word max-h-72 overflow-auto"
                            style="color: var(--color-text)"
                            >{{
                              entry.conceptRequest.responseText ||
                                entry.conceptRequest.responseBody ||
                                'No response captured.'
                            }}</pre
                          >
                        </div>
                      } @else {
                        <p class="text-sm italic" style="color: var(--color-text-muted)">
                          No concept request was captured for this puzzle.
                        </p>
                      }
                    </div>

                    <div
                      class="rounded-xl p-4"
                      style="background: var(--color-surface); border: var(--border-style)"
                    >
                      <p
                        class="font-mono text-[10px] uppercase tracking-widest mb-3"
                        style="color: var(--color-accent)"
                      >
                        Puzzle HTML Request
                      </p>
                      @if (entry.htmlRequest) {
                        <pre
                          class="text-xs whitespace-pre-wrap wrap-break-word max-h-72 overflow-auto"
                          style="color: var(--color-text)"
                          >{{ entry.htmlRequest.payload.prompt }}</pre
                        >
                        <div class="mt-4 pt-4" style="border-top: var(--border-style)">
                          <p
                            class="font-mono text-[10px] uppercase tracking-widest mb-2"
                            style="color: var(--color-accent)"
                          >
                            Response
                          </p>
                          <pre
                            class="text-xs whitespace-pre-wrap wrap-break-word max-h-72 overflow-auto"
                            style="color: var(--color-text)"
                            >{{
                              entry.htmlRequest.responseText ||
                                entry.htmlRequest.responseBody ||
                                'No response captured.'
                            }}</pre
                          >
                        </div>
                      } @else {
                        <p class="text-sm italic" style="color: var(--color-text-muted)">
                          No HTML request was captured for this puzzle.
                        </p>
                      }
                    </div>
                  </div>

                  <div
                    class="min-h-0 h-full rounded-xl overflow-hidden flex flex-col"
                    style="background: var(--color-surface); border: var(--border-style)"
                  >
                    <div
                      class="px-4 py-3 shrink-0 flex items-center justify-between"
                      style="border-bottom: var(--border-style)"
                    >
                      <p
                        class="font-mono text-[10px] uppercase tracking-widest"
                        style="color: var(--color-accent)"
                      >
                        Puzzle Preview
                      </p>
                      @if (previewMessage()) {
                        <p class="text-xs" style="color: rgb(134,239,172)">
                          {{ previewMessage() }}
                        </p>
                      }
                    </div>
                    <div class="flex-1 min-h-0">
                      <app-puzzle-frame
                        class="h-full min-h-0 block"
                        [puzzle]="selectedPuzzle()!"
                        [rewardClue]="entry.rewardClue"
                        [previewOnly]="true"
                        (puzzleSolved)="onPreviewSolved($event)"
                      />
                    </div>
                  </div>
                </div>
              } @else {
                <p class="text-sm italic px-1" style="color: var(--color-text-muted)">
                  Select a puzzle to inspect its prompts and play it.
                </p>
              }
            </div>
          </div>
        }
      </div>

      <!-- ── Request detail modal ─────────────────────────────────────── -->
      @if (selectedRequest(); as request) {
        <div
          class="absolute inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-8"
          style="background: rgba(0,0,0,0.6)"
          (click)="selectedRequestId.set(null)"
        >
          <div
            class="relative w-full max-w-3xl max-h-[85vh] rounded-2xl border flex flex-col overflow-hidden"
            style="background: var(--color-secondary); border-color: rgba(201,168,76,0.28); box-shadow: var(--shadow-style)"
            (click)="$event.stopPropagation()"
          >
            <div
              class="px-5 py-4 flex items-start gap-4 shrink-0"
              style="border-bottom: var(--border-style)"
            >
              <div class="flex-1 min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="inline-flex px-2 py-1 rounded-full font-mono text-[10px] uppercase tracking-widest shrink-0"
                    [style.background]="requestStatusTone(request).background"
                    [style.color]="requestStatusTone(request).color"
                  >
                    {{ request.status }}
                  </span>
                  <h3 class="font-heading text-xl truncate" style="color: var(--color-accent)">
                    {{ request.meta?.label ?? request.path }}
                  </h3>
                </div>
                <div class="mt-2 flex flex-wrap gap-2">
                  <span
                    class="font-mono text-[10px] uppercase tracking-widest"
                    style="color: var(--color-text-muted)"
                    >{{ request.path }}</span
                  >
                  @if (request.meta?.category) {
                    <span
                      class="font-mono text-[10px] uppercase tracking-widest"
                      style="color: var(--color-text-muted)"
                      >{{ requestCategoryLabel(request) }}</span
                    >
                  }
                  @if (request.meta?.puzzleId) {
                    <span
                      class="font-mono text-[10px] uppercase tracking-widest"
                      style="color: var(--color-text-muted)"
                      >{{ request.meta?.puzzleId }}</span
                    >
                  }
                  @if (request.completedAt) {
                    <span
                      class="font-mono text-[10px] uppercase tracking-widest"
                      style="color: var(--color-text-muted)"
                      >{{ requestDurationLabel(request) }}</span
                    >
                  }
                  <span class="font-mono text-[10px]" style="color: var(--color-text-muted)">{{
                    request.startedAt | date: 'medium'
                  }}</span>
                </div>
              </div>
              <button
                type="button"
                (click)="selectedRequestId.set(null)"
                class="p-1.5 rounded-lg cursor-pointer transition-opacity hover:opacity-80 shrink-0"
                style="border: var(--border-style); color: var(--color-text)"
              >
                <span class="material-icons text-base">close</span>
              </button>
            </div>

            <div class="overflow-y-auto p-5 flex flex-col gap-4">
              <div class="rounded-lg p-4" style="background: rgba(0,0,0,0.18)">
                <p
                  class="font-mono text-[10px] uppercase tracking-widest mb-2"
                  style="color: var(--color-accent)"
                >
                  Prompt
                </p>
                <pre
                  class="text-xs whitespace-pre-wrap wrap-break-word max-h-72 overflow-auto"
                  style="color: var(--color-text)"
                  >{{ request.payload.prompt }}</pre
                >
              </div>

              <div class="rounded-lg px-4 py-3" style="background: rgba(0,0,0,0.18)">
                <p
                  class="font-mono text-[10px] uppercase tracking-widest mb-3"
                  style="color: var(--color-accent)"
                >
                  Parameters
                </p>
                <div class="flex flex-wrap gap-4 text-xs">
                  <span
                    ><span style="color: var(--color-text-muted)">max tokens</span>&nbsp;<span
                      class="font-mono"
                      style="color: var(--color-text)"
                      >{{ request.payload.maxTokens }}</span
                    ></span
                  >
                  <span
                    ><span style="color: var(--color-text-muted)">temperature</span>&nbsp;<span
                      class="font-mono"
                      style="color: var(--color-text)"
                      >{{ request.payload.temperature }}</span
                    ></span
                  >
                  @if (request.payload.systemPrompt) {
                    <span
                      ><span style="color: var(--color-text-muted)">system prompt</span>&nbsp;<span
                        class="font-mono"
                        style="color: var(--color-text)"
                        >yes</span
                      ></span
                    >
                  }
                </div>
              </div>

              <div class="rounded-lg p-4" style="background: rgba(0,0,0,0.18)">
                <p
                  class="font-mono text-[10px] uppercase tracking-widest mb-2"
                  style="color: var(--color-accent)"
                >
                  Response
                </p>
                @if (request.error) {
                  <p
                    class="text-xs mb-3 whitespace-pre-wrap wrap-break-word"
                    style="color: rgb(252,165,165)"
                  >
                    {{ request.error }}
                  </p>
                }
                <pre
                  class="text-xs whitespace-pre-wrap wrap-break-word max-h-96 overflow-auto"
                  style="color: var(--color-text)"
                  >{{
                    tryPrettyJson(request.responseText || request.responseBody) ||
                      'No response body captured.'
                  }}</pre
                >
              </div>
            </div>
          </div>
        </div>
      }

      <!-- ── Image detail modal ─────────────────────────────────────────── -->
      @if (selectedImage(); as image) {
        <div
          class="absolute inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-8"
          style="background: rgba(0,0,0,0.6)"
          (click)="selectedImageId.set(null)"
        >
          <div
            class="relative w-full max-w-xl max-h-[90vh] rounded-2xl border flex flex-col overflow-hidden"
            style="background: var(--color-secondary); border-color: rgba(201,168,76,0.28); box-shadow: var(--shadow-style)"
            (click)="$event.stopPropagation()"
          >
            <div
              class="px-5 py-3 flex items-center justify-between gap-4 shrink-0"
              style="border-bottom: var(--border-style)"
            >
              <div class="flex items-center gap-2 min-w-0">
                <span
                  class="inline-flex px-2 py-1 rounded-full font-mono text-[10px] uppercase tracking-widest shrink-0"
                  [style.background]="statusBackground(image)"
                  [style.color]="statusColor(image)"
                >
                  {{ image.status }}
                </span>
                <h3 class="font-heading text-lg truncate" style="color: var(--color-accent)">
                  {{ image.entityType }} / {{ image.entityId }}
                </h3>
              </div>
              <button
                type="button"
                (click)="selectedImageId.set(null)"
                class="p-1.5 rounded-lg cursor-pointer transition-opacity hover:opacity-80 shrink-0"
                style="border: var(--border-style); color: var(--color-text)"
              >
                <span class="material-icons text-base">close</span>
              </button>
            </div>

            <div class="overflow-y-auto flex flex-col">
              @if (image.outputUrl) {
                <img
                  [src]="image.outputUrl"
                  [alt]="image.entityId"
                  class="w-full max-h-72 object-contain"
                  style="background: rgba(0,0,0,0.3)"
                />
              } @else {
                <div
                  class="w-full h-48 flex items-center justify-center"
                  style="background: rgba(0,0,0,0.2)"
                >
                  <span class="material-icons text-4xl" style="color: var(--color-text-muted)"
                    >image</span
                  >
                </div>
              }

              <div class="p-5 flex flex-col gap-4">
                <p class="text-xs" style="color: var(--color-text-muted)">
                  {{ image.startedAt | date: 'medium' }}
                </p>

                <div class="rounded-lg p-4" style="background: rgba(0,0,0,0.18)">
                  <p
                    class="font-mono text-[10px] uppercase tracking-widest mb-2"
                    style="color: var(--color-accent)"
                  >
                    Original Prompt
                  </p>
                  <pre
                    class="text-xs whitespace-pre-wrap wrap-break-word max-h-48 overflow-auto"
                    style="color: var(--color-text)"
                    >{{ image.originalPrompt }}</pre
                  >
                </div>

                <div class="rounded-lg p-4" style="background: rgba(0,0,0,0.18)">
                  <p
                    class="font-mono text-[10px] uppercase tracking-widest mb-2"
                    style="color: var(--color-accent)"
                  >
                    Safe Prompt
                  </p>
                  <pre
                    class="text-xs whitespace-pre-wrap wrap-break-word max-h-48 overflow-auto"
                    style="color: var(--color-text)"
                    >{{ image.safePrompt || 'Not captured.' }}</pre
                  >
                </div>

                @if (image.requestPayload) {
                  <div class="rounded-lg p-4" style="background: rgba(0,0,0,0.18)">
                    <p
                      class="font-mono text-[10px] uppercase tracking-widest mb-2"
                      style="color: var(--color-accent)"
                    >
                      Worker Payload
                    </p>
                    <pre
                      class="text-xs whitespace-pre-wrap wrap-break-word"
                      style="color: var(--color-text)"
                      >{{ formatJson(image.requestPayload) }}</pre
                    >
                  </div>
                }

                @if (image.error) {
                  <div class="rounded-lg p-4" style="background: rgba(239,68,68,0.1)">
                    <p
                      class="font-mono text-[10px] uppercase tracking-widest mb-2"
                      style="color: rgb(252,165,165)"
                    >
                      Error
                    </p>
                    <p
                      class="text-xs whitespace-pre-wrap wrap-break-word"
                      style="color: rgb(252,165,165)"
                    >
                      {{ image.error }}
                    </p>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      }
    </section>

      <!-- ── Image lightbox ─────────────────────────────────────────────── -->
      @if (lightboxUrl()) {
        <div
          class="fixed inset-0 z-200 flex items-center justify-center p-6"
          style="background: rgba(0,0,0,0.88)"
          (click)="lightboxUrl.set(null)"
        >
          <button
            type="button"
            (click)="lightboxUrl.set(null)"
            class="absolute top-4 right-4 p-2 rounded-lg cursor-pointer"
            style="background: rgba(0,0,0,0.5); color: var(--color-text)"
          >
            <span class="material-icons">close</span>
          </button>
          <img
            [src]="lightboxUrl()!"
            class="max-w-full max-h-full rounded-xl object-contain"
            style="box-shadow: 0 8px 48px rgba(0,0,0,0.7)"
            (click)="$event.stopPropagation()"
          />
        </div>
      }
  `,
})
export class DebugDashboardComponent {
  readonly casePackage = input.required<CasePackage>();
  readonly closeRequested = output<void>();

  protected readonly activeTab = signal<DebugTab>('requests');
  protected readonly previewMessage = signal('');
  protected readonly tabs = [
    { id: 'requests' as const, label: 'AI Requests' },
    { id: 'images' as const, label: 'Images' },
    { id: 'puzzles' as const, label: 'Puzzles' },
    { id: 'case-data' as const, label: 'Case Data' },
  ];
  protected readonly caseDataSection = signal<CaseDataSection>('metadata');
  protected readonly caseDataSections: { id: CaseDataSection; label: string; count: () => number | null }[] = [
    { id: 'metadata', label: 'Metadata', count: () => null },
    { id: 'truth', label: 'Truth Layer', count: () => null },
    { id: 'suspects', label: 'Suspects', count: () => this.casePackage().suspects.length },
    { id: 'locations', label: 'Locations', count: () => this.casePackage().locations.length },
    { id: 'clues', label: 'Clues', count: () => this.casePackage().clues.length },
    { id: 'events', label: 'Events', count: () => this.casePackage().eventGraph.length },
    { id: 'timeline', label: 'Timeline', count: () => this.casePackage().timeline.length },
    { id: 'puzzles-data', label: 'Puzzles', count: () => this.casePackage().puzzles.length },
  ];
  protected readonly selectedSuspectId = signal<string | null>(null);
  protected readonly selectedLocationId = signal<string | null>(null);
  protected readonly selectedClueId = signal<string | null>(null);
  protected readonly selectedEventId = signal<string | null>(null);
  protected readonly selectedTimelineId = signal<string | null>(null);
  protected readonly selectedCasePuzzleId = signal<string | null>(null);

  protected readonly selectedSuspect = computed(() =>
    this.casePackage().suspects.find((s) => s.id === this.selectedSuspectId()) ?? null,
  );
  protected readonly selectedLocation = computed(() =>
    this.casePackage().locations.find((l) => l.id === this.selectedLocationId()) ?? null,
  );
  protected readonly selectedCaseClue = computed(() =>
    this.casePackage().clues.find((c) => c.id === this.selectedClueId()) ?? null,
  );
  protected readonly selectedCaseEvent = computed(() =>
    this.casePackage().eventGraph.find((e) => e.id === this.selectedEventId()) ?? null,
  );
  protected readonly selectedTimeline = computed(() =>
    this.casePackage().timeline.find((t) => t.id === this.selectedTimelineId()) ?? null,
  );
  protected readonly selectedCasePuzzle = computed(() =>
    this.casePackage().puzzles.find((p) => p.id === this.selectedCasePuzzleId()) ?? null,
  );

  protected readonly lightboxUrl = signal<string | null>(null);

  private readonly debug = inject(DebugTraceService);

  protected readonly sortedRequests = computed(() =>
    [...this.debug.aiRequests()].filter((r) => r.meta?.category !== 'image-safe-prompt').reverse(),
  );
  protected readonly sortedImages = computed(() => [...this.debug.imageRequests()].reverse());
  protected readonly selectedRequestId = signal<string | null>(null);
  protected readonly selectedRequest = computed((): DebugAiRequestRecord | null => {
    const id = this.selectedRequestId();
    if (!id) return null;
    return this.sortedRequests().find((r) => r.id === id) ?? null;
  });
  protected readonly selectedImageId = signal<string | null>(null);
  protected readonly selectedImage = computed((): DebugImageRecord | null => {
    const selectedId = this.selectedImageId();
    if (!selectedId) return null;
    return this.sortedImages().find((image) => image.id === selectedId) ?? null;
  });
  protected readonly puzzleEntries = computed((): PuzzleDebugEntry[] => {
    const pkg = this.casePackage();
    const requests = this.debug.aiRequests();
    return pkg.puzzles.map((puzzle) => ({
      puzzleId: puzzle.id,
      title: puzzle.title,
      description: puzzle.description,
      rewardClue: pkg.clues.find((clue) => clue.id === puzzle.rewardedClueId) ?? null,
      eventTitle:
        pkg.eventGraph.find((event) => event.puzzleId === puzzle.id)?.title ?? 'Puzzle Event',
      conceptRequest:
        requests.find(
          (request) =>
            request.meta?.category === 'puzzle-concept' && request.meta.puzzleId === puzzle.id,
        ) ?? null,
      htmlRequest:
        requests.find(
          (request) =>
            request.meta?.category === 'puzzle-html' && request.meta.puzzleId === puzzle.id,
        ) ?? null,
    }));
  });
  protected readonly selectedPuzzleId = signal<string | null>(null);
  protected readonly selectedPuzzleEntry = computed(() => {
    const entries = this.puzzleEntries();
    const selectedId = this.selectedPuzzleId();
    if (selectedId) {
      return entries.find((entry) => entry.puzzleId === selectedId) ?? entries[0] ?? null;
    }
    return entries[0] ?? null;
  });
  protected readonly selectedPuzzle = computed(() => {
    const entry = this.selectedPuzzleEntry();
    if (!entry) return null;
    return this.casePackage().puzzles.find((puzzle) => puzzle.id === entry.puzzleId) ?? null;
  });

  protected closePanel(): void {
    if (this.selectedRequestId()) {
      this.selectedRequestId.set(null);
      return;
    }
    if (this.selectedImageId()) {
      this.selectedImageId.set(null);
      return;
    }
    this.closeRequested.emit();
  }

  protected onPreviewSolved(clueId: string): void {
    const reward = this.casePackage().clues.find((clue) => clue.id === clueId);
    this.previewMessage.set(
      reward ? `Preview solved. Reward clue: ${reward.name}` : 'Preview solved.',
    );
  }

  protected formatJson(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }

  protected tryPrettyJson(value: string | undefined): string {
    if (!value) return '';
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  protected snippet(value: string, maxLength: number): string {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
  }

  protected statusBackground(image: DebugImageRecord): string {
    switch (image.status) {
      case 'success':
        return 'rgba(34,197,94,0.14)';
      case 'cached':
        return 'rgba(59,130,246,0.16)';
      case 'error':
        return 'rgba(239,68,68,0.16)';
      default:
        return 'rgba(250,204,21,0.16)';
    }
  }

  protected statusColor(image: DebugImageRecord): string {
    switch (image.status) {
      case 'success':
        return 'rgb(134,239,172)';
      case 'cached':
        return 'rgb(147,197,253)';
      case 'error':
        return 'rgb(252,165,165)';
      default:
        return 'rgb(253,224,71)';
    }
  }

  protected tabCount(tabId: DebugTab): number | null {
    switch (tabId) {
      case 'requests':
        return this.sortedRequests().length;
      case 'images':
        return this.sortedImages().length;
      case 'puzzles':
        return this.puzzleEntries().length;
      case 'case-data':
        return null;
    }
  }

  protected requestStatusTone(request: DebugAiRequestRecord): RequestStatusTone {
    switch (request.status) {
      case 'success':
        return {
          background: 'rgba(34,197,94,0.14)',
          color: 'rgb(134,239,172)',
        };
      case 'error':
        return {
          background: 'rgba(239,68,68,0.16)',
          color: 'rgb(252,165,165)',
        };
      default:
        return {
          background: 'rgba(250,204,21,0.16)',
          color: 'rgb(253,224,71)',
        };
    }
  }

  protected requestCategoryLabel(request: DebugAiRequestRecord): string {
    return request.meta?.category?.replace(/-/g, ' ') ?? 'other';
  }

  protected requestDurationLabel(request: DebugAiRequestRecord): string {
    if (!request.completedAt) return 'in flight';
    const startedAt = new Date(request.startedAt).getTime();
    const completedAt = new Date(request.completedAt).getTime();
    return `${Math.max(0, completedAt - startedAt)}ms`;
  }
}
