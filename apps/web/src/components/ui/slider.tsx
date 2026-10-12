import { Slider as SliderPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

interface SliderProps extends React.ComponentProps<typeof SliderPrimitive.Root> {
  /** Spoken value per thumb (e.g. "1:23 of 3:45"); defaults to the number. */
  readonly valueText?: (value: number) => string;
}

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  valueText,
  'aria-label': ariaLabel,
  ...props
}: SliderProps) {
  const _values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
    [value, defaultValue, min, max],
  );

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      // Local edit: omit undefined controlled/uncontrolled values (exactOptionalPropertyTypes).
      {...(defaultValue === undefined ? {} : { defaultValue })}
      {...(value === undefined ? {} : { value })}
      min={min}
      max={max}
      className={cn(
        'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          'relative grow overflow-hidden bg-muted data-[orientation=horizontal]:h-1 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5',
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            'absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full',
          )}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          // Local edit: the thumb carries role="slider", so it needs the accessible name and value.
          aria-label={ariaLabel}
          {...(valueText === undefined || _values[index] === undefined
            ? {}
            : { 'aria-valuetext': valueText(_values[index]) })}
          className="block size-4 shrink-0 border-2 border-pop-ink bg-primary transition-transform hover:scale-110 disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
