const TPromise = require('../src/TPromise');


module.exports={
    resolved:TPromise.resolve,
    rejected:TPromise.reject,
    deferred(){
        const result = {};
        result.promise = new TPromise((resolve, reject) => {
            result.resolve = resolve;
            result.reject = reject;
        });
        return result;
    }
}