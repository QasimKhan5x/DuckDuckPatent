<template>
    <div class="placeholder-container">
        <Skeleton width="100%" height="16px"></Skeleton>
        <Skeleton width="80%" height="16px"></Skeleton>
        <br />
        <Skeleton width="100%" height="12px" v-for="(_i, i) of Array.from(Array(5).keys())" :key="i"></Skeleton>
        <Skeleton width="100%" height="12px"></Skeleton>
        <Skeleton width="60%" height="12px"></Skeleton>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

/**
 * Placeholder component for a patent preview which shows a loading skeleton and can be used to indicate that a patent is currently
 * being loaded
 */
export default defineComponent({
    name: 'PreviewPlaceholder.vue',
});
</script>

<style lang="scss" scoped>
.placeholder-container {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
</style>
