const mongoose = require("mongoose");

const resumeSchema = new mongoose.Schema(
    {
        userId : {
            type : mongoose.Schema.Types.ObjectId,
            ref : "User",
            required : true,
            index: true,
        },
        title : {type : String,required : true,trim : true,maxlength : 120},
        currentVersionId : {
            type : mongoose.Schema.Types.ObjectId,
            ref : "ResumeVersion",
            default : null,
        },
        latestVersionNumber : {type : Number,default : 0},

        // sha256 of the uploaded text. Used for duplicate detection across
        // accounts in the same college (scope §12.1): the same resume under two
        // different emails is a cheap, non-punitive signal for the placement
        // cell, not an automatic rejection.
        contentHash : {type : String,default : "",index : true},
    },
    {timestamps : true}
);  
resumeSchema.index({userId : 1,updatedAt : -1});

module.exports = mongoose.model("Resume",resumeSchema);