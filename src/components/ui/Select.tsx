import { Dropdown, type DropdownProps } from './Dropdown';

type Props<T extends string> = Omit<DropdownProps<T>, 'selected' | 'onChoose' | 'isMultiple'> & {
    value: T;
    onChange: (value: T) => void;
};

export function Select<T extends string>({ value, onChange, ...props }: Props<T>) {
    return (
        <Dropdown
            {...props}
            selected={value !== '' ? [value] : []}
            onChoose={onChange}
            isMultiple={false}
        />
    );
}
