import { isSingBox } from '@/api'
import { GLOBAL, PROXY_TAB_TYPE } from '@/constant'
import { isHiddenGroup } from '@/helper'
import { configs } from '@/store/config'
import {
  getProxyGroupChains,
  proxiesFilter,
  proxiesTabShow,
  proxyGroupList,
  proxyMap,
  proxyProviederList,
} from '@/store/proxies'
import { customGlobalNode, displayGlobalByMode, manageHiddenGroup } from '@/store/settings'
import { isEmpty } from 'lodash'
import { computed, ref } from 'vue'

const filterGroups = (all: string[]) => {
  if (proxiesFilter.value.trim().length) {
    return all.filter(matchProxyGroupFilter)
  }
  if (manageHiddenGroup.value) {
    return all
  }

  return all.filter((name) => !isHiddenGroup(name))
}

const matchProxyGroupFilter = (name: string) => {
  const normalizedFilter = proxiesFilter.value.trim()
  if (!normalizedFilter) {
    return true
  }

  try {
    return new RegExp(normalizedFilter, 'i').test(name)
  } catch {
    return true
  }
}

const getRenderGroups = () => {
  if (isEmpty(proxyMap.value)) {
    return []
  }

  if (proxiesTabShow.value === PROXY_TAB_TYPE.PROVIDER) {
    return proxyProviederList.value.map((group) => group.name)
  }

  if (displayGlobalByMode.value) {
    if (configs.value?.mode.toUpperCase() === GLOBAL) {
      const globalName =
        isSingBox.value && proxyMap.value[customGlobalNode.value] ? customGlobalNode.value : GLOBAL

      return getProxyGroupChains(globalName).filter(matchProxyGroupFilter)
    }

    return filterGroups(proxyGroupList.value)
  }

  return filterGroups([...proxyGroupList.value, GLOBAL])
}

export const disableProxiesPageScroll = ref(false)
export const isProxiesPageMounted = ref(false)
export const renderGroups = computed(() => {
  const groups = getRenderGroups()

  if (isProxiesPageMounted.value) {
    return groups
  }

  return groups.slice(0, 16)
})
