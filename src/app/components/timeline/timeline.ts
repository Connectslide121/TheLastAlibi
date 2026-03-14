import { Component, input } from '@angular/core';
import { TimelineEvent } from '../../models';

@Component({
  selector: 'app-timeline',
  standalone: true,
  template: `
    <ol
      class="relative border-l-2 ml-4 flex flex-col gap-6"
      style="border-color: rgba(201,168,76,0.3);"
    >
      @for (event of events(); track event.id) {
        <li class="relative pl-6">
          <!-- Dot on the timeline line -->
          <span
            class="absolute -left-2.25 top-1 w-4 h-4 rounded-full border-2 shrink-0 transition-colors"
            [style.border-color]="'var(--color-accent)'"
            [style.background-color]="
              revealTruth()
                ? event.isTrue
                  ? 'var(--color-accent)'
                  : 'rgb(185, 28, 28)'
                : 'var(--color-surface)'
            "
          >
          </span>

          <div class="flex items-start gap-3">
            <span
              class="text-(--color-accent) text-xs font-mono whitespace-nowrap mt-0.5 opacity-70"
            >
              {{ event.time }}
            </span>
            <p
              class="text-(--color-text) text-sm leading-relaxed opacity-80 transition-all"
              [class.line-through]="revealTruth() && !event.isTrue"
              [class.opacity-40]="revealTruth() && !event.isTrue"
            >
              {{ event.description }}
            </p>
          </div>

          @if (revealTruth() && !event.isTrue) {
            <p class="text-red-400 text-xs italic mt-1 pl-15">False — part of the deception</p>
          }
        </li>
      }
    </ol>
  `,
})
export class TimelineComponent {
  readonly events = input.required<TimelineEvent[]>();
  readonly revealTruth = input(false);
}
