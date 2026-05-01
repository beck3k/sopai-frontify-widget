import { defineSettings } from '@frontify/guideline-blocks-settings';

export const settings = defineSettings({
    main: [
        {
            id: 'main-dropdown',
            type: 'dropdown',
            defaultValue: 'content_block',
            size: 'large',
            disabled: true,
            choices: [
                {
                    value: 'content_block',
                    icon: 'BuildingBlock',
                    label: 'Content Block',
                },
            ],
        },
        {
            id: 'hmacKey',
            label: 'HMAC Key',
            info: 'Shared secret used to sign auth requests. Get this from the TeamMate admin.',
            type: 'input',
            inputType: 'password',
            placeholder: 'Paste HMAC key',
            clearable: true,
        },
    ],
    style: [
        {
            id: 'color',
            label: 'Button Color',
            type: 'colorInput',
            defaultValue: { red: 113, green: 89, blue: 215, alpha: 1, name: 'Frontify Violet' },
        },
    ],
});
