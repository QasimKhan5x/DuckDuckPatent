import { shallowMount } from '@vue/test-utils';
import Button from '@/components/Button.vue';

describe('Button.vue', () => {
    it('renders props.btnText when passed', () => {
        const msg = 'Test Button';
        const wrapper = shallowMount(Button, {
            props: { btnText: msg },
        });
        expect(wrapper.html()).toContain(`<span class="btn-text">${msg}</span>`);
    });
});
