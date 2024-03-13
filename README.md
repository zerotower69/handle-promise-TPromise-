# 手写Promise(TPromise)，javascript实现版本

> 手写版本的Promise，参考[Promise A+规范](https://promisesaplus.com/),
> 并利用原生JS提供的[queueMicroTask() API](https://developer.mozilla.org/zh-CN/docs/Web/API/queueMicrotask)结合微任务，
> 真正做到了原生Promise体验，强化了对于时间循环中宏任务和微任务的理解。
>
> 手写后，利用了 promise A+ 官方提供的[promises-aplus-tests](https://www.npmjs.com/package/promises-aplus-tests)库包
> 实现了总共872个测试用例的测试，并全部通过。
> 

## 脚本
```bash
npm run test
```
** 如有其它疑问，欢迎通过issue留言，或者加入QQ群聊（434063310）获得解答 **
** 觉得不错的话给我一个star吧 **