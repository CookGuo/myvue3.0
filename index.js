/**
 * 2.0响应式缺陷 
 * 1. 递归实现响应式，效率不高
 * 2. 直接添加的数据不能得到代理
 * 3. 数组的操作只能是默认实现的方法
 * 
 * 我们来看看vue3.0是怎么样解决这些问题
 */

// 为了解决我们数据被多次代理的问题，我们需要做映射表，这里使用 weakmap来做
// 这也是源码中使用的数据结构

const toProxy = new WeakMap() // 用来放 当前对象：代理过的对象
const toRow = new WeakMap() // 用来放 代理过的对象： 当前对象

function isOwnProperty(target, key) {
  return target.hasOwnProperty(key)
}

function isObject(value) {
  return typeof value === 'object' && value != null
}

/**
 * 这是第一步，实现数据的劫持
 */
function reactive(target) {
  return createReactiveObject(target)
}

function createReactiveObject(target) {
  if(!isObject(target)) {
    return target
  }
  // 说明已经代理过了
  const proxyed = toProxy.get(target)
  if (proxyed) {
    return proxyed
  }
  // 防止反复代理
  // reactive(proxy) reactive(proxy)
  if (toRow.has(target)) {
    return target
  }

  const handles = {
    get(target, key, receiver) {
      let result = Reflect.get(target, key, receiver)
      // 进行依赖收集
      /**
       * 这里很巧妙，在第一次调用effect的时候，一定能触发一次target的get方法的
       * 此时我们将依赖的关系建立
       */
      track(target, key)
      // 如果是多层次的对象的，我们需要递归代理
      return isObject(result) ? reactive(result) : result
    },
    set(target, key, value, receiver) {
      let oldValue = target[key]
      // 我们不知道设置是否成功，所以要做一个反射，来告诉我们是否成功
      let flag = Reflect.set(target, key, value, receiver)
      // 新增属性
      /**
       * 这里是数组的一个处理，如果push[1,2] => [1,2,3]
       * 这里会触发两次的set，一次是下标的set一次是length的set
       * 但是length的set的触发在这里是无意义的，length的修改并不需要是响应式的
       * oldValue !== value 可以规避length的修改带来的影响
       */
      if (!isOwnProperty(target, key)) {
        trigger(target, 'add', key)
        console.log('设置新的属性')
      // 修改属性
      } else if (oldValue !== value) {
        trigger(target, 'set', key)
        console.log('修改原有的属性')
      }
      return flag
    },
    deleteProperty() {

    }
  }

  const observe = new Proxy(target, handles)

  toProxy.set(target, observe)
  toRow.set(observe, target)

  return observe
}
// 栈数组，先进后出
/**
 * 依赖收集 (数据: [effect])
 * 每个数据对应它的依赖，数据一变执行方法
 */
const activeEffectStacks = []

/**
 * 建立依赖关系
 * 数据结构
 * 
 * (WeakMap): {
 *   targe: (Map) {
 *     key: (Set) [effect,effect]
 *   }
 * }
 */
const targetMap = new WeakMap()
function track(target, key) {
  let effect = activeEffectStacks[activeEffectStacks.length - 1]
  if (effect) {
    let depsMap = targetMap.get(target)

    if (!depsMap) {
      depsMap = new Map()
      targetMap.set(target, depsMap)
    }

    let deps = depsMap.get(key)
    if (!deps) {
      deps = new Set()
      depsMap.set(key, deps)
    }
    if (!deps.has(effect)) {
      deps.add(effect)
    }
  }
}

/**
 * 依赖的触发
 */
function trigger(target, type, key) {
  // 这里先不做type的区分
  const depsMap = targetMap.get(target)
  if (depsMap) {
    const deps = depsMap.get(key)
    if (deps) {
      deps.forEach(effect => {
        effect()
      })
    }
  }
}

/**
 * 第二步，实现数据的响应式
 * 数据变通知依赖的数据更新
 * 
 * 副作用，先会执行一次，当数据变话的时候在执行一次
 * 这里面设计到一个依赖收集的东西，源码里面用一个栈(数组[])来做的
 * 
 */
function effect(fn) {
  const effectFun = createReactiveEffect(fn)
  effectFun()
}
function createReactiveEffect(fn) {
  const effect = function() {
    run(effect, fn)
  }
  return effect
}

function run(effect, fn) {
  try {
    // 栈里面已经拿到数据了以后，清掉保证数据量
    // try 保证fn执行报错时，一定能将栈清除
    activeEffectStacks.push(effect)
    fn()
  } finally{
    activeEffectStacks.pop(effect)
  }
}

let proxy = reactive({name: 'vue3.0'})
effect(() => {
  console.log(proxy.name)
})
proxy.name = '111'
