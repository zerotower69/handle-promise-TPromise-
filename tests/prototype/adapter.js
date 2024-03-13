const TPromise = require('../../src/TPromise-prototype');


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