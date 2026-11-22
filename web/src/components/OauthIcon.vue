<template>
  <!-- 登录方式图标：优先渲染管理员上传的自定义图片，其次是内置图标（按 provider.icon / type / slug 回退） -->
  <img
    v-if="imgSrc"
    class="oauth-icon oauth-icon-img"
    :src="imgSrc"
    :width="size"
    :height="size"
    :alt="alt"
  />
  <svg
    v-else
    class="oauth-icon"
    :viewBox="def.viewBox"
    :width="size"
    :height="size"
    aria-hidden="true"
    focusable="false"
  >
    <path
      v-for="(p, i) in def.paths"
      :key="i"
      :d="p.d"
      :fill="p.fill ?? (p.stroke ? 'none' : 'currentColor')"
      :stroke="p.stroke ? 'currentColor' : undefined"
      :stroke-width="p.stroke ? (p.width ?? 1.7) : undefined"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getOauthIcon, resolveOauthIconKey } from '../utils/oauthIcons';

const props = withDefaults(
  defineProps<{
    /** 内置图标 key（provider.icon） */
    icon?: string;
    /** 自定义图片地址（provider.icon_url），优先于内置图标 */
    iconUrl?: string;
    /** provider 类型（icon 未设置时按类型回退） */
    type?: string;
    /** provider slug（icon 未设置时按 slug 回退，如 gitee） */
    slug?: string;
    /** 图标边长（px） */
    size?: number;
    /** 自定义图片的 alt 文本 */
    alt?: string;
  }>(),
  { icon: '', iconUrl: '', type: '', slug: '', size: 16, alt: '' },
);

/** 自定义图片地址：只接受 http(s) 外链或本站 /uploads/ 路径（与后端校验规则一致） */
const imgSrc = computed(() => {
  const u = String(props.iconUrl ?? '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u) || u.startsWith('/uploads/')) return u;
  return '';
});

/** 生效的内置图标定义 */
const def = computed(() => getOauthIcon(resolveOauthIconKey(props.icon, props.type, props.slug)));
</script>

<style scoped>
.oauth-icon {
  display: block;
  flex: none;
}
.oauth-icon-img {
  object-fit: contain;
  border-radius: 3px;
  background: transparent;
}
</style>
