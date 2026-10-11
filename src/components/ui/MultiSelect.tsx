import { Dropdown, type DropdownProps } from './Dropdown';

type Props<T extends string> = Omit<DropdownProps<T>, 'selected' | 'onChoose' | 'isMultiple'> & {
    value: T[];
    onChange: (value: T[]) => void;
};

export function MultiSelect<T extends string>({ value, onChange, ...props }: Props<T>) {
    return (
        <Dropdown
            {...props}
            selected={value}
            onChoose={(chosen) =>
                onChange(
                    value.includes(chosen)
                        ? value.filter((item) => item !== chosen)
                        : [...value, chosen],
                )
            }
            isMultiple
        />
    );
}
