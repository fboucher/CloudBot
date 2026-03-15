class Note
{
    constructor(text) {
        this.time = new Date();
        this.text = text;
    }
}

class UserSession
{
    constructor(user) {
        this.lastUpdate = "";
        this.dropCount = 0;
        this.landedCount = 0;
        this.user = user;
        this.lastMessage = "";
        this.highScore = 0;
        this.bestHighScore = 0;
    }
}

class Raider{

    constructor(user, viewers) {
        this.user = user;
        this.viewers = viewers;
    }
}


class Subscriber{

    constructor(user, viewers) {
        this.user = user;
        this.streamMonths = streamMonths;
    }
}


class Cheerer{

    constructor(user, bits) {
        this.user = user;
        this.bits = bits;
    }
}

class Todo{

    constructor(id, description, status) {
        this.id = id;
        this.description = description;
        this.status = status;
    }
}

class Reminder{

    constructor(name, message) {
        
        this.Name = name;
        this.Message = message;
        this.Status = ReminderStatusEnum.active;
        this.LastCheck = new Date();
    }
}

class TimeLog{
    
    constructor(user, message, time) {
        this.user = user;
        this.message = message;
        this.time = time;
    }
}

compareHightScore = function(a, b) {
    return a.highScore - b.highScore;
}

compareBestHightScore = function(a, b) {
    return a.bestHighScore - b.bestHighScore;
}

class StreamSession
{
    Project = function(value)
    {
        this.Project = value;
    }

    Id = function(value)
    {
        this.Id = value;
    }

    Title = function(value)
    {
        this.Title = value;
    }

    Init = function(){
        this.Id = 0;
        this.Project = "";
        this.Title = "";
        this.DateTimeStart = "";
        this.DateTimeEnd = "";
        this.Notes = [];
        this.UserSession =  [];
        this.NewFollowers = [];
        this.Raiders = [];
        this.Subscribers = [];
        this.Hosts = [];
        this.Cheerers = [];
        this.TimeLogs = [];
        this.Todos = [];
        this.Reminders = [];
    }

    constructor() {
        this.Id = 0;
        this.Project = "";
        this.Title = "";
        this.DateTimeStart = "";
        this.DateTimeEnd = "";
        this.Notes = [];
        this.UserSession =  [];
        this.NewFollowers = [];
        this.Raiders = [];
        this.Subscribers = [];
        this.Hosts = [];
        this.Cheerers = [];
        this.TimeLogs = [];
        this.Todos = [];
        this.Reminders = [];
    }
}

const SoundEnum = {
    yeah : "public/medias/yeah.mp3",
    bonjourHi : "public/medias/BonjourHi.mp3",
    sirbonjour : "public/medias/sir-bonjour-hi.mp3",
    sirbonjourhowareyou : "public/medias/sir-bonjour-hi-how-are-you.mp3",
    badFeeling : "public/medias/badfeeling.mp3",
    doorknock: "public/medias/knocking-on-door.mp3",
    hmmhmm: "public/medias/hmmhmm.mp3",
    rain: "public/medias/rain.mp3",
    rainUmbrella: "public/medias/Rain-On-Umbrella.com.mp3",
    previously: "public/medias/previously.mp3"
};

const TodoStatusEnum = {
    new : "new",
    inProgress : "inProgress",
    done : "done",
    cancel: "cancel"
};

const ReminderStatusEnum = {
    active : "active",
    inactive : "inactive",
    done : "done"
};

getUserPosition = function(userName)
{
    console.log( "... Searching for: " + userName );
    for (i=0; i < _streamSession.UserSession.length; i++) {
        console.log( "... looking at : " + _streamSession.UserSession[i].user );
        if (_streamSession.UserSession[i].user === userName) {
            console.log( "... found in position: " + i );
            return i;
        }
    }
    _streamSession.UserSession.push(new UserSession(userName));
    return i++;
}



updateTrace = function(message)
{
    document.querySelector("#cbTitle").innerHTML = message;
}



clean = function()
{
    document.querySelector("#imageViewer").innerHTML = "";
    document.querySelector("#lastChatMsg").innerHTML = "";
    document.querySelector("#cbTitle").innerHTML = "";
}



cloud = function(expression)
{

    const fileName = "CB-" + expression + ".gif";
    document.querySelector("#imageViewer").innerHTML = "<img src='public/medias/" + fileName + "' class='nuage'>";
    setTimeout(() => {  clean(); }, 5000);
}

ChatBotShow = function(expression, imgText)
{

    const fileName = "CB-" + expression + ".gif";
    document.querySelector("#imageViewer").innerHTML = "<img src='public/medias/" + fileName + "' class='nuage'>";
    document.querySelector("#imageViewer").innerHTML += "<img src='public/medias/generated/" + imgText + "' class='textBubble'>";
    setTimeout(() => {  clean(); }, 5000);
}

sleep = function (ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

scores = function()
{
    console.log( "!scores was typed in chat" );
    const today = new Date();
    let cntScoreDisplayed = 1;

    var sortedUsers = _streamSession.UserSession.sort(compareHightScore);
    
    for ( i=0; i < sortedUsers.length; i++) {
        //console.log(`... checking: ${sortedUsers[i].user} --- d2: ${sortedUsers[i].lastUpdate}`);

        if(isSameDay(today, new Date(sortedUsers[i].lastUpdate))){
            const msg = `${sortedUsers[i].user} --> ${sortedUsers[i].highScore}`;
            setTimeout(() => {
                DisplayNotification( msg );
            }, cntScoreDisplayed++ * 1000); 
        }
        // else{
        //     console.log( `... Skipping ${sortedUsers[i].user}, didn't play today.`);
        // }
    }
    cloud("Wow");
}


isSameDay = function(d1, d2) {

    if((d1 instanceof Date) && (d2 instanceof Date)){
        return d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();
    }
    return false;
}


UserLanded = function(user, curScore)
{
    let userPos = getUserPosition(user);

    if(userPos >= 0)
    {
        _streamSession.UserSession[userPos].landedCount++;

        if(_streamSession.UserSession[userPos].highScore < curScore)
        {
            console.log( "... New highscore " + curScore);
            _streamSession.UserSession[userPos].highScore = curScore;

            if(_streamSession.UserSession[userPos].bestHighScore < curScore)
            {
                _streamSession.UserSession[userPos].bestHighScore = curScore;
            }
            HightScoreParty(user, curScore);
        }
        else{
            console.log( "... no new highscore, try again");
        }
    }
    else
    {
        console.log( "... User NOT found?!");
    }
}

        

ParseMessage = function(message)
{
    // FBoucheros: FBoucheros landed for 86.60!
    let splitedMsg = message.split(" ");
   
    if(splitedMsg.length > 1 && splitedMsg[1] === "landed")
    {
        let user = splitedMsg[0].toLowerCase();
        let curScore = splitedMsg[3].slice(0, -1);

        UserLanded(user, curScore);
    }
    else if( message.startsWith("Thank you for following") )
    {
        let user = splitedMsg[4].toLowerCase().slice(0, -1);
        _streamSession.NewFollowers.push(user);
    }
}


DisplayNotification = function(title, message)
{
    console.log( "... displaying notification: " + message);
    displayAnnouncement(title, message, 'theme-cb');
}


HightScoreParty = function(user, score){
    let msg = `${user} just beat his/her highest score! now at: ${score}`
    console.log( "... " + msg);
    //ChatBotShout(msg);
    DisplayNotification("New high score!", msg);
    cloud("Yeah");
    playSound("yeah", SoundEnum.yeah);
}



StatsFor = function(user){
    
    console.log( "... looking stats for: " + user);
    let userPos = getUserPosition(user);
    console.log( "... userPos: " + userPos);

    let msg = `${user} sorry no stats yet...`


    if(userPos >= 0)
    {
        msg = `Tentative(s): ${_streamSession.UserSession[userPos].dropCount} <br />Landed: ${_streamSession.UserSession[userPos].landedCount} <br />Highest score: ${_streamSession.UserSession[userPos].highScore}`
    }

    //console.log( "... " + msg.replace(/<br \/>/g, "   "));
    ComfyJS.Say( msg.replace(/<br \/>|<br\/>/g, "   ") );
    DisplayNotification(`${user} Stats`, msg)
    //document.querySelector("#cbTitle").innerHTML = msg;
    setTimeout(() => {  clean(); }, 5000);
}



ChatBotSay = function(msg)
{
    ComfyJS.Say( msg );
}




ChatBotShout = function(message)
{
    console.log( "!ChatBotShout was typed in chat" );
    document.querySelector("#cbTitle").innerText = message 
    setTimeout(() => { document.querySelector("#cbTitle").innerText = ""; }, 5000);
}



IncrementDropCounter = function(user)
{
    let userPos = getUserPosition(user);
    _streamSession.UserSession[userPos].dropCount++;
    _streamSession.UserSession[userPos].lastUpdate = new Date();
}



hello = function(user)
{
    const data = {user: user};
    const options = {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    }

    fetch('/Hello', options)
    .then(response => response.json())
    .then(result => {
        console.log('Success:', result);
        //ChatBotSay(result.msg);

        setTimeout(() => {
            ChatBotShow('Thumbs-up', result.msg)
        }, 1000); 
        
    })
    .catch(error => {
        console.error('Error:', error);
    });

}



Attention = function(user, message)
{
    const data = {user: user, message: message};
    const options = {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    }

    fetch('/Attention', options)
    .then(response => response.json())
    .then(result => {
        console.log('Success:', result);
  
        setTimeout(() => {
            ChatBotShow('Thumbs-up', result.msg)
            playSound("hmmhmm", SoundEnum.hmmhmm);
        }, 1000); 
        
    })
    .catch(error => {
        console.error('Error:', error);
    });

}

addTodo = function(description)
{
    const cntTodos = _streamSession.Todos.length;

    _streamSession.Todos.push(new Todo(cntTodos + 1, description, TodoStatusEnum.new));
    RefreshTodosArea();
}


SetTodoVisibility = function(isVisible)
{
    const todoArea = document.getElementById("todoArea");
    if(!todoArea){
        return;
    }

    todoArea.style.display = isVisible ? "block" : "none";
}

ShowTodoArea = function()
{
    SetTodoVisibility(true);
}

HideTodoArea = function()
{
    SetTodoVisibility(false);
}


RefreshTodosArea = function()
{
    let htmlTodos = "";
    _streamSession.Todos.forEach(element => {
        htmlTodos += `<div class="todo ${element.status}">${element.id} - ${element.description}</div>`
    });  
    document.querySelector("#todoList").innerHTML = htmlTodos;
}

SetTodoStatus = function(id, status)
{
    let found = false;
    const max = _streamSession.Todos.length;

    console.log(`... searching for!: ${id}`);

    for(i = 0; i < max && !found; i++){
        console.log(`Look at: ${_streamSession.Todos[i].id} - ${_streamSession.Todos[i].status}`);
        if(_streamSession.Todos[i].id == id){
            console.log(`match!: ${_streamSession.Todos[i].id} - ${_streamSession.Todos[i].status}`);
            _streamSession.Todos[i].status = status;
            found = true;
        }
    }
    RefreshTodosArea();
}




addReminder = function(name, message)
{ 
    _streamSession.Reminders.push(new Reminder(name, message));
}



SetReminderStatus = function(name, status)
{
    let found = false;
    const max = _streamSession.Reminders.length;

    console.log(`... searching for!: ${name}`);

    for(i = 0; i < max && !found; i++){
        console.log(`Look at: ${_streamSession.Reminders[i].Name} - ${_streamSession.Reminders[i].Status}`);
        if(_streamSession.Reminders[i].id == id){
            console.log(`match!: ${_streamSession.Reminders[i].Name} - ${_streamSession.Reminders[i].Status}`);
            _streamSession.Reminders[i].Status = status;
            found = true;
        }
    }
}



SaveToFile = function(verbose = true)
{
    const data = {streamSession: _streamSession};
    //console.log('..c. data: ', data);
    const options = {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    }

    fetch('/savetofile', options)
    .then(response => response.json())
    .then(result => {
        //console.log('Success:', result);
        if(verbose){
            ChatBotSay(result.msg);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        ChatBotSay('Error: ' + error);
    });

}



LoadFromFile = async function(projectName, isReload, callback)
{
    
    const options = {
        method: 'GET',
        headers: {'Content-Type': 'application/json'}
    }

    fetch('/loadfromfile', options)
    .then(response => response.json())
    .then(result => {
        console.log('session reveived from server side:', result);
        //console.log('...Trace:', Object.values(result));
        //_streamSession = Object.values(result);
        LoadStreamSession(result, projectName, isReload, callback);
    })
    .catch(error => {
        console.error('Error:', error);
    });

}


LoadStreamSession = function(data, projectName, isReload, callback)
{
    _streamSession.Init();

    if(isReload == undefined || isReload == null){
        isReload = false;
        console.log('... this is not a reload!');
    }
        
    
    // loading users scores
    _streamSession.UserSession = data.UserSession.map((o) => { 
        const newUser = new UserSession(); 
        for (const [key, value] of Object.entries(o)) 
        { 
            newUser[key] = value; 
        } return newUser; 
    });

    if(callback !== undefined && callback !== null){
        callback(projectName);
    }
        
    if(isReload){
        // loading NewFollowers
        _streamSession.NewFollowers = data.NewFollowers;

        if(data.Raiders.length > 0){
            _streamSession.Raiders = data.Raiders.map((o) => { 
                const newRaider = new Raider(); 
                for (const [key, value] of Object.entries(o)) 
                { 
                    newRaider[key] = value; 
                } return newRaider; 
            });
        }

        if(data.TimeLogs.length > 0){
            _streamSession.TimeLogs = data.TimeLogs.map((o) => { 
                const newTimeLog = new TimeLog(); 
                for (const [key, value] of Object.entries(o)) 
                { 
                    newTimeLog[key] = value; 
                } return newTimeLog; 
            });
        }

        if(data.Todos.length > 0){
            _streamSession.Todos = data.Todos.map((o) => { 
                const newTodo = new Todo(); 
                for (const [key, value] of Object.entries(o)) 
                { 
                    newTodo[key] = value; 
                } return newTodo; 
            });
        }

        if(data.Reminders.length > 0){
            _streamSession.Reminders = data.Reminders.map((o) => { 
                const newReminder = new Reminder(); 
                for (const [key, value] of Object.entries(o)) 
                { 
                    newReminder[key] = value; 
                } return newReminder; 
            });
        }

        _streamSession.Subscribers = data.Subscribers;
        _streamSession.Hosts = data.Hosts;
        _streamSession.Cheerers = data.Cheerers;
        _streamSession.Project = data.Project;
        _streamSession.DateTimeStart = data.DateTimeStart;
        _streamSession.Notes = data.Notes;
        _streamSession.Id = data.Id;
    }
    else{
        ResetHightScore();
    }

    console.log('done loading:', _streamSession);
}

getCloudAudio = function(name, fileName, inLoop){

    let cbAudio = document.getElementById(name);
    if(cbAudio){
        return cbAudio;
    }
        
    let audio = new Audio(fileName);
    audio.id = name;
    audio.loop = inLoop;
    document.body.appendChild(audio);
    return getCloudAudio(name);
}

playSound = function(name, fileName)
{
    playSound(name, fileName, false);
}

playSound = function(name, fileName, inLoop)
{
    try {
        let cbAudio = getCloudAudio(name, fileName, inLoop);
        cbAudio.play().catch(err => {
            console.log('Audio play failed:', err.message);
        });
    } catch (err) {
        console.log('Audio error:', err.message);
    }
}

stopSound = function(name, fileName, inLoop)
{
    let cbAudio = getCloudAudio(name, fileName, inLoop);
    cbAudio.pause();
}


CheckReminders = function()
{
    _streamSession.Reminders.forEach(reminder => {
        console.log(`... looking at: ${reminder.Name}`);
        if( reminder.Status == ReminderStatusEnum.active){
            console.log(`... ${reminder.Name} is active`);
            reminder.LastCheck = new Date();
            ChatBotSay(reminder.Message);
        }
    });
}


ResetHightScore = function()
{
    console.log('... Resetting highScores');
    for (i=0; i < _streamSession.UserSession.length; i++) {
        _streamSession.UserSession[i].highScore = 0;
    }
}





// == Generate files =========================================
// ===

StreamNoteStart = async function(projectName)
{

    LoadFromFile(projectName, false, function(projectName){
        //console.log('.. the project name: ', projectName);
        //console.log('.. streamSession before : ', _streamSession);
        
        // Get the current stream counter and increment it
        fetch('/incrementstreamcounter', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'}
        })
        .then(response => response.json())
        .then(counterData => {
            _streamSession.Id = counterData.currentStreamNumber;
            _streamSession.Project = projectName;
            _streamSession.DateTimeStart = new Date();
            console.log('.. streamSession just after : ', _streamSession);
            // Display banner immediately when project is set
            showProjectBanner();
        })
        .catch(error => {
            console.error('Error loading stream counter:', error);
            // Fallback to random if counter fails
            if(_streamSession.id == undefined || _streamSession.id == null || _streamSession.id == 0){
                _streamSession.Id = Math.floor((Math.random() * 100));
            }
            _streamSession.Project = projectName;
            _streamSession.DateTimeStart = new Date();
            console.log('.. streamSession just after (fallback): ', _streamSession);
            // Display banner immediately when project is set
            showProjectBanner();
        });
    });

}





StreamNoteStop = function()
{
    _streamSession.DateTimeEnd = new Date(); 
    SaveToFile();
    console.log('_streamSession: ', _streamSession);
    let streamNotes = Generate_streamSession();
    console.log('Notes: ', streamNotes);
    SaveNotesToFile(_streamSession, streamNotes);
}


Generate_streamSession = function()
{
    let streamNotes = "";

    // Header
    streamNotes += GenerateStreamNotetHeader();

    //Project detail
    streamNotes += GenerateSessiontInfo();

    // Stream Details
    streamNotes += GenerateTimeLogSection();
    
    // Cloudies info
    streamNotes += GenerateCloudiesInfo();

    // Goal extra
    streamNotes += GenerateExtraInfo();
    return streamNotes;
}



GenerateStreamNotetHeader = function()
{
    let today = new Date().toISOString().split('T')[0];
    let title = _streamSession.Title && _streamSession.Title.trim() 
        ? _streamSession.Title 
        : "_____ (stream " + _streamSession.Id + ")";
    let headerSection = "---\nlayout: post\ntitle: " + title + "\n";
    headerSection += "featured-image: https://img.youtube.com/vi/_________/hqdefault.jpg\n";
    headerSection += "date: " + today + "  06:30 -0500\n";
    headerSection += "categories:  " + _streamSession.Project + "\n---\n\n## Summary\n\n\n\n📺 - Twitch archive - stream no. " + _streamSession.Id + "\n\n";
    headerSection += "\n## Replay\n\n{% include youtube.html id=\"_________\" %}\n\n";
    headerSection += "<br/><!--more-->\n";

    return headerSection;
}



GenerateSessiontInfo = function()
{
    let sessionSection = "\n### Project\n\n"
    sessionSection += "All the code for this project is available on GitHub: " + _streamSession.Project + " - https://github.com/FBoucher/" + _streamSession.Project + "\n";

    sessionSection += GenerateTodoSection();
    return sessionSection;
}



GenerateCloudiesInfo = function()
{
    let cloudiesSection = GenerateNewFollowerSection(); 
    cloudiesSection     += GenerateRaidersSection();
    cloudiesSection     += GenerateHostSection();
    cloudiesSection     += GenerateCheersSection();
    cloudiesSection     += GenerateParachuteSection();

    return cloudiesSection;
}


GenerateNewFollowerSection = function()
{
    if(_streamSession.NewFollowers.length > 0){
        let followerSection = "\n### New Followers\n\n"

        for(userName of _streamSession.NewFollowers)
        {
            followerSection += `- [@${userName}](https://www.twitch.tv/${userName})\n`;
        }

        return followerSection;
    }
    return "";
}


GenerateRaidersSection = function()
{
    if(_streamSession.Raiders.length > 0){
        let raidersSection = "\n### Raids\n\n"

        for(raider of _streamSession.Raiders)
        {
            raidersSection += `- [@${raider.user}](https://www.twitch.tv/${raider.user}) has raided you with a party of ${raider.viewers}\n`;
        }

        return raidersSection;
    }

    return "";
}


GenerateHostSection = function()
{
    if(_streamSession.Hosts.length > 0){
        let hostSection = "\n### Hosts\n\n"

        for(userName of _streamSession.Hosts)
        {
            hostSection += `- [@${userName}](https://www.twitch.tv/${userName})\n`;
        }

        return hostSection;
    }
    return "";
}



GenerateTodoSection = function()
{
    if(_streamSession.Todos.length > 0){
        let todoSection = "\n### TodDos\n\n"

        _streamSession.Todos.forEach(element => {
            const checkbox = (element.status == TodoStatusEnum.done) ? "[X]": "[ ]";
            const isCancelled = (element.status == TodoStatusEnum.cancel) ? "~": "";
            const isInProgress = (element.status == TodoStatusEnum.inProgress) ? "**": "";
            todoSection += `- ${isCancelled}${checkbox} ${isInProgress}${element.description}${isInProgress}${isCancelled}\n`;
        });

        return todoSection;
    }
    return "";
}




GenerateCheersSection = function()
{
    if(_streamSession.Cheerers.length > 0){
        let cheerersSection = "\n### Cheers\n\n"

        for(cheerer of _streamSession.Cheerers)
        {
            cheerersSection += `- [@${cheerer.user}](https://www.twitch.tv/${cheerer.user})  ${cheerer.bits} bits\n`;
        }

        return cheerersSection;
    }

    return "";
}


GenerateTimeLogSection = function()
{
    if(_streamSession.TimeLogs.length > 0){
        let timeLogsSection = "\n### TimeLogs\n\n"
        timeLogsSection += `    00:00:00 Intro\n    00:00:10 Bonjour, Hi!\n`;

        for(timeLog of _streamSession.TimeLogs)
        {
            timeLogsSection += `    ${timeLog.time} ${timeLog.message}\n`;
        }

        return timeLogsSection;
    }

    return "";
}


GenerateParachuteSection = function(){

    if(_streamSession.UserSession.length > 0){
        const today = new Date();
        let parachuteSection = "\n### Game Results\n\n"
        
        var sortedUsers = _streamSession.UserSession.sort(compareHightScore);

        for ( i=0; i < sortedUsers.length; i++) {
            if(isSameDay(today, new Date(sortedUsers[i].lastUpdate))){
                parachuteSection += `- [@${sortedUsers[i].user}](https://www.twitch.tv/${sortedUsers[i].user}): ${sortedUsers[i].highScore}\n`;
            }
        }

        // --- Statistics ---
        let bestScoreUser = null;
        let biggestLoser = null;
        let luckiest = null;
        let superParticipant = null;
        let maxScore = -Infinity;
        let maxDrop = -Infinity;
        let minDropForMaxScore = Infinity;
        let maxDropLoser = -Infinity;

        _streamSession.UserSession.forEach(user => {
            // Best score
            if (user.highScore > maxScore) {
                maxScore = user.highScore;
                bestScoreUser = user;
            }
            // Super participant
            if (user.dropCount > maxDrop) {
                maxDrop = user.dropCount;
                superParticipant = user;
            }
            // Biggest loser
            if (user.bestHighScore == 0 && user.dropCount > maxDropLoser) {
                maxDropLoser = user.dropCount;
                biggestLoser = user;
            }
        });

        // Luckiest: among users with the highest score, pick the one with the lowest dropCount
        _streamSession.UserSession.forEach(user => {
            if (user.highScore === maxScore) {
                if (user.dropCount < minDropForMaxScore) {
                    minDropForMaxScore = user.dropCount;
                    luckiest = user;
                }
            }
        });

        parachuteSection += "\n#### Statistics\n\n";
        if (bestScoreUser) {
            parachuteSection += `- 🏆Best score: [@${bestScoreUser.user}](https://www.twitch.tv/${bestScoreUser.user}) with ${bestScoreUser.highScore}\n`;
        }
        if (biggestLoser) {
            parachuteSection += `- 😭Biggest loser: [@${biggestLoser.user}](https://www.twitch.tv/${biggestLoser.user}) with ${biggestLoser.dropCount} drops and no high score\n`;
        }
        if (luckiest) {
            parachuteSection += `- 🍀Luckiest: [@${luckiest.user}](https://www.twitch.tv/${luckiest.user}) with best score ${luckiest.highScore} and only ${luckiest.dropCount} drops\n`;
        }
        if (superParticipant) {
            parachuteSection += `- 🎖️Super participant: [@${superParticipant.user}](https://www.twitch.tv/${superParticipant.user}) with ${superParticipant.dropCount} drops\n`;
        }

        return parachuteSection;
    }

    return "";
}


GenerateExtraInfo = function(){

    if(_streamSession.Notes.length > 0){
        let noteSection = "\n### Notes/ References / Snippets\n\n"

        for(note of _streamSession.Notes){
            noteSection += `- ${note}\n`;
        }
        return noteSection;
    }

    return "";
}



SaveNotesToFile = function(streamSession, streamNotes)
{
    const data = {id: streamSession.Id, project: streamSession.Project, notes: streamNotes};
    console.log('..g. data: ', data);
    const options = {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    }

    fetch('/genstreamnotes', options)
    .then(response => response.json())
    .then(result => {
        console.log('Success:', result);
        ChatBotSay(result.msg);
    })
    .catch(error => {
        console.error('Error:', error);
    });
}


CreateTimeLog = function(message, user){

    const now = new Date();
    const startTime = Date.parse(_streamSession.DateTimeStart);
    //console.log('startTime: ', startTime);

    const msec = Math.abs(now - startTime);   
    const seconds = Math.floor(msec / 1000);
    const minutes = Math.floor(seconds / 60 );
    const hours = Math.floor(minutes / 60 );
    
    const strHH = ("0" + hours% 60).substr(-2,2);
    const strMM = ("0" + minutes% 60).substr(-2,2);
    const strSS = ("0" + seconds% 60).substr(-2,2);
    
    const strTime = `${strHH}:${strMM}:${strSS}`
 
    console.log('strTime: ', strTime);

    _streamSession.TimeLogs.push(new TimeLog(user, message, strTime));
}

SavingNote = function(message){
    _streamSession.Notes.push(message);
}



// Twitch Events handling

LogRaid = function(user, viewers){
    
    _streamSession.Raiders.push(new Raider(user, viewers));
}


LogSub = function(user, message, subTierInfo, streamMonths, cumulativeMonths){

    cloud("Yeah");
    playSound("yeah", SoundEnum.yeah);
    _streamSession.Subscribers.push(new Subscriber(user, streamMonths));
}


LogHost = function(user, viewers, autohost, extra ){
    _streamSession.Hosts.push(user);
}


LogCheer = function( user, message, bits, flags, extra ){
    _streamSession.Cheerers.push( new Cheerer(user, bits));
}

CreateCloud = function(){

    const animDuration = getRndInt(50,200); 
    const animDelay = getRndInt(0,30);
    const animTop = getRndInt(0,300);
    const animZ = getRndInt(100,105);
    const cloudImage = getRndInt(1,4);
    const fliped = (Math.random() < 0.5)?1:-1;
    const animSize = Math.random() * (1.2 - 0.2) + 0.2;
    const opacity = Math.random() * (0.5 - 0.2) + 0.2;

    const elemStyle = `animation-duration: ${animDuration}s;animation-delay:${animDelay}s;top:${animTop}px;z-index: ${animZ};opacity:${opacity}; -webkit-transform: scaleX(${fliped});transform: scaleX(${fliped});-moz-transform:scale(${animSize});-webkit-transform:scale(${animSize});transform:scale(${animSize});`;

    const elem = document.createElement('div');
    elem.style.cssText = elemStyle;
    elem.className = "movingCloud";
    const cloud = document.createElement('img');
    cloud.src = `public/medias/cloud-${cloudImage}.png`;
    let sky = document.getElementById("sky");
    elem.appendChild(cloud);
    sky.appendChild(elem)

}


getRndInt = function(min, max) {
    return Math.floor(Math.random() * (max - min) ) + min;
}


makeItRain = function() {

    // Clear existing rain elements
    document.querySelectorAll('.rain').forEach(el => el.innerHTML = '');
  
    var increment = 0;
    var drops = "";
    var backDrops = "";
  
    while (increment < 100) {
      var randoHundo = (Math.floor(Math.random() * (98 - 1 + 1) + 1));
      var randoFiver = (Math.floor(Math.random() * (5 - 2 + 1) + 2));
      increment += randoFiver;
      drops += '<div class="drop" style="left: ' + increment + '%; bottom: ' + (randoFiver + randoFiver - 1 + 100) + '%; animation-delay: 0.' + randoHundo + 's; animation-duration: 0.5' + randoHundo + 's;"><div class="stem" style="animation-delay: 0.' + randoHundo + 's; animation-duration: 0.5' + randoHundo + 's;"></div><div class="splat" style="animation-delay: 0.' + randoHundo + 's; animation-duration: 0.5' + randoHundo + 's;"></div></div>';
      backDrops += '<div class="drop" style="right: ' + increment + '%; bottom: ' + (randoFiver + randoFiver - 1 + 100) + '%; animation-delay: 0.' + randoHundo + 's; animation-duration: 0.5' + randoHundo + 's;"><div class="stem" style="animation-delay: 0.' + randoHundo + 's; animation-duration: 0.5' + randoHundo + 's;"></div><div class="splat" style="animation-delay: 0.' + randoHundo + 's; animation-duration: 0.5' + randoHundo + 's;"></div></div>';
    }
  
    const frontRow = document.querySelector('.rain.front-row');
    const backRow = document.querySelector('.rain.back-row');
    if (frontRow) frontRow.innerHTML += drops;
    if (backRow) backRow.innerHTML += backDrops;
  }


// Project Banner Functions
let bannerTimer = null;
let githubCache = {};
const GITHUB_OWNER = 'fboucher'; // Default GitHub owner

const bannerVariants = [
    { name: 'pixel', className: 'banner-pixel', image: 'public/medias/CB-Yeah.gif', alt: 'CloudBot Yeah', pixelate: false, useMarquee: true },
    { name: 'cb', className: 'banner-cb', image: 'public/medias/CB-Thumbs-up.gif', alt: 'CloudBot thumbs up', pixelate: false, useMarquee: true },
    { name: 'retro', className: 'banner-retro', image: 'public/medias/CB-Wow.gif', alt: 'CloudBot Wow', pixelate: false, useMarquee: true }
];
let bannerVariantIndex = -1;

showProjectBanner = async function() {
    const projectName = _streamSession.Project;
    
    // Check if project is not set or null
    if (!projectName || projectName === "" || projectName === null) {
        console.log("Project not set, calling !attention");
        Attention("CloudBot", "Project is not set! Please set a project name.");
        return;
    }

    const banner = document.getElementById('projectBanner');
    const nameEl = document.getElementById('bannerProjectName');
    const urlEl = document.getElementById('bannerGithubUrl');
    const descEl = document.getElementById('bannerDescription');
    const imageEl = document.getElementById('bannerImage');

    if (!banner || !nameEl || !urlEl || !descEl || !imageEl) {
        return;
    }

    // Cycle through visual variants
    bannerVariantIndex = (bannerVariantIndex + 1) % bannerVariants.length;
    const variant = bannerVariants[bannerVariantIndex];
    banner.className = 'banner-base';
    banner.classList.add(variant.className);

    // Set project name
    nameEl.textContent = projectName;

    // Try to extract GitHub URL pattern from project name
    let githubUrl = '';
    let description = '';

    // Check if project name contains github URL pattern or owner/repo format
    if (projectName.includes('github.com/')) {
        githubUrl = projectName.includes('http') ? projectName : 'https://github.com/' + projectName.split('github.com/')[1];
    } else if (projectName.includes('/')) {
        // Assume format is owner/repo
        githubUrl = `https://github.com/${projectName}`;
    } else {
        // Just a project name, prepend default owner
        githubUrl = `https://github.com/${GITHUB_OWNER}/${projectName}`;
    }

    // Fetch description from GitHub API if we have a URL
    if (githubUrl) {
        try {
            const repoPath = githubUrl.replace('https://github.com/', '');
            
            // Check cache first
            if (githubCache[repoPath]) {
                description = githubCache[repoPath];
            } else {
                const apiUrl = `https://api.github.com/repos/${repoPath}`;
                const response = await fetch(apiUrl);
                
                if (response.ok) {
                    const data = await response.json();
                    description = data.description || '';
                    githubCache[repoPath] = description; // Cache it
                } else {
                    console.log('GitHub API response not ok:', response.status);
                    Attention("CloudBot", `Could not fetch project info from GitHub (status: ${response.status})`);
                }
            }
        } catch (error) {
            console.log('Could not fetch GitHub description:', error);
            Attention("CloudBot", `Error fetching project info: ${error.message || 'Network error'}`);
        }
    }

    // Update banner content
    if (!description || description.trim() === '') {
        // If description is empty, hide URL and show custom message
        urlEl.innerHTML = '';
        descEl.textContent = "Looks like it's a new project, ask Frank about it!";
    } else {
        // Normal display with URL and description
        urlEl.innerHTML = githubUrl ? `<span class="banner-github-icon">🔗</span>${githubUrl}` : '';
        descEl.textContent = description;
    }
    // For side-by-side, ensure both are visible in the same row (handled by HTML/CSS)

    // Apply image and pixelation
    imageEl.src = variant.image;
    imageEl.alt = variant.alt;
    imageEl.classList.toggle('pixelate', !!variant.pixelate);

    // Show banner with animation
    banner.classList.add('show');

    // Hide banner after 60 seconds
    setTimeout(() => {
        banner.classList.remove('show');
    }, 60000);
}

hideProjectBanner = function() {
    const banner = document.getElementById('projectBanner');
    banner.classList.remove('show');
}

startBannerTimer = function() {
    // Show banner immediately on start
    setTimeout(() => {
        showProjectBanner();
    }, 5000); // Wait 5 seconds after page load

    // Then show every 15 minutes (900000 ms)
    bannerTimer = setInterval(() => {
        showProjectBanner();
    }, 900000);
}

// Auto-start banner timer when page loads
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        startBannerTimer();
    });
}

// ===== ANNOUNCEMENT SYSTEM =====
// Fresh announcement system with themed pop-ups
const announcementThemes = ['theme-pixel', 'theme-cb', 'theme-retro', 'theme-social', 'theme-sponsor'];

const announcements = [
    // Follow/Subscribe messages
    {
        title: "🎉 Join Behind My Cloud!",
        message: "Follow on Twitch (twitch.tv/fboucheros) or Subscribe on YouTube (@behindmycloud)!",
        themes: ['theme-pixel', 'theme-cb', 'theme-retro']
    },
    {
        title: "📺 Behind My Cloud",
        message: "Watch live coding, demos prep, and open source projects!",
        themes: ['theme-cb', 'theme-retro']
    },
    {
        title: "🤖 Hey! It's CeeBee!",
        message: "Subscribe to Behind My Cloud and join the cloud crew!",
        themes: ['theme-pixel', 'theme-social']
    },
    {
        title: "☁️ Cloud Power!",
        message: "Loving the stream? Follow to catch more live coding action!",
        themes: ['theme-cb', 'theme-retro', 'theme-social']
    },
    
    // GitHub Sponsor messages
    {
        title: "💖 Support Frank's Work",
        message: "Become a GitHub Sponsor at github.com/sponsors/fboucher",
        themes: ['theme-sponsor']
    },
    {
        title: "❤️ Love the content?",
        message: "Consider sponsoring on GitHub! Every bit helps create more!",
        themes: ['theme-sponsor', 'theme-cb']
    },
    {
        title: "⭐ Support Open Source",
        message: "Help Frank continue creating amazing open source projects!",
        themes: ['theme-sponsor', 'theme-retro']
    },
    
    // Social media messages
    {
        title: "📱 Find Frank Online",
        message: "I'm @fboucheros everywhere! YouTube, Twitch, Twitter, LinkedIn...",
        themes: ['theme-social']
    },
    {
        title: "👨‍💻 Follow on GitHub",
        message: "Check out Frank's projects at github.com/fboucher (@fboucher)",
        themes: ['theme-social', 'theme-retro']
    },
    {
        title: "🌐 Connect With Frank",
        message: "@fboucheros on social media | @fboucher on GitHub",
        themes: ['theme-social', 'theme-pixel']
    },
    {
        title: "🔗 More Projects",
        message: "Visit github.com/fboucher for all the cool stuff we're building!",
        themes: ['theme-social', 'theme-cb']
    },
    
    // Channel description
    {
        title: "☁️ Behind My Cloud",
        message: "Technical content creation behind the scenes - Join the journey!",
        themes: ['theme-pixel', 'theme-cb']
    },
    {
        title: "💡 Awesome Stream!",
        message: "Thanks for hanging out! More exciting projects coming soon!",
        themes: ['theme-cb', 'theme-social']
    },
    {
        title: "🚀 Innovation Hub",
        message: "Live coding, demos, and open source development - all in one place!",
        themes: ['theme-retro', 'theme-pixel']
    }
];

let announcementTimer = null;
const announcementQueue = [];
let isDisplayingAnnouncement = false;

displayAnnouncement = function(title, message, themeClass) {
    const container = document.getElementById('announcementContainer');
    if (!container) return;

    // Randomize which side the announcement appears on
    const fromLeft = Math.random() < 0.5;
    const directionClass = fromLeft ? 'from-left' : 'from-right';

    const announcement = document.createElement('div');
    announcement.className = `announcement ${themeClass} ${directionClass}`;
    announcement.innerHTML = `
        <div class="ann-title">${title}</div>
        <div class="ann-message">${message}</div>
    `;

    container.appendChild(announcement);
    console.log(`... displaying announcement: "${title}" with theme: ${themeClass} on ${directionClass}`);

    // Make it clickable to dismiss
    announcement.style.cursor = 'pointer';
    announcement.addEventListener('click', () => {
        announcement.classList.add('removing');
        setTimeout(() => {
            announcement.remove();
            processNextAnnouncement();
        }, 400);
    });

    // Auto-dismiss after 30 seconds
    const dismissTimeout = setTimeout(() => {
        if (announcement.parentElement) {
            announcement.classList.add('removing');
            setTimeout(() => {
                if (announcement.parentElement) {
                    announcement.remove();
                    processNextAnnouncement();
                }
            }, 400);
        }
    }, 30000);

    announcement.dismissTimeout = dismissTimeout;
}

showRandomAnnouncement = function() {
    // Pick a random announcement
    const randomAnnouncement = announcements[Math.floor(Math.random() * announcements.length)];
    
    // Pick a random theme from the announcement's allowed themes
    const randomTheme = randomAnnouncement.themes[Math.floor(Math.random() * randomAnnouncement.themes.length)];
    
    displayAnnouncement(randomAnnouncement.title, randomAnnouncement.message, randomTheme);
}

queueAnnouncement = function(title, message, themeClass) {
    announcementQueue.push({ title, message, themeClass });
    processNextAnnouncement();
}

processNextAnnouncement = function() {
    if (announcementQueue.length > 0 && !isDisplayingAnnouncement) {
        isDisplayingAnnouncement = true;
        const ann = announcementQueue.shift();
        displayAnnouncement(ann.title, ann.message, ann.themeClass);
        setTimeout(() => {
            isDisplayingAnnouncement = false;
        }, 7500);
    }
}

startAnnouncementTimer = function() {
    // Show first announcement after 3 minutes
    setTimeout(() => {
        showRandomAnnouncement();
    }, 180000);
    
    // Then show a random announcement every 10 minutes
    announcementTimer = setInterval(() => {
        showRandomAnnouncement();
    }, 600000);
}

stopAnnouncementTimer = function() {
    if (announcementTimer) {
        clearInterval(announcementTimer);
        announcementTimer = null;
    }
}


// Auto-start announcement timer when page loads
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        startAnnouncementTimer();
    });
}

// ===== EFFECT SYSTEM - Poll for effects from admin panel =====
let lastEffectTimestamp = 0;

async function checkForEffects() {
    try {
        const response = await fetch('/currenteffect');
        const effect = await response.json();
        
        if (effect && effect.timestamp && effect.timestamp > lastEffectTimestamp) {
            lastEffectTimestamp = effect.timestamp;
            console.log('New effect detected:', effect.type);
            handleEffect(effect);
        }
    } catch (err) {
        // Silent fail - effect polling should not spam console
    }
}

function handleEffect(effect) {
    console.log('Handling effect:', effect.type);
    
    // Clear the effect on server after handling
    fetch('/cleareffect', { method: 'POST' }).catch(() => {});
    
    switch (effect.type) {
        case 'hello':
            if (effect.image) {
                ChatBotShow('Thumbs-up', effect.image);
            } else {
                cloud('Thumbs-up');
            }
            playSound('yeah', SoundEnum.yeah);
            break;
            
        case 'attention':
            if (effect.image) {
                ChatBotShow('Thumbs-up', effect.image);
            }
            playSound('hmmhmm', SoundEnum.hmmhmm);
            break;
            
        case 'drop':
            cloud('Wow');
            playSound('yeah', SoundEnum.yeah);
            break;
            
        case 'rain':
            {
                const sky = document.getElementById('sky');
                if (sky) sky.className = 'darkcloud';
                setTimeout(() => {
                    makeItRain();
                    playSound('rain', SoundEnum.rain, true);
                }, 5000);
            }
            break;
            
        case 'sun':
            {
                document.querySelectorAll('.rain').forEach(el => el.innerHTML = '');
                stopSound('rain', SoundEnum.rain, true);
                const sky = document.getElementById('sky');
                if (sky) sky.className = 'lightcloud';
                cloud('Yeah');
            }
            break;
            
        case 'startproject':
            if (effect.project) {
                _streamSession.Project = effect.project;
                StreamNoteStart(effect.project);
            }
            break;
            
        case 'stopproject':
            {
                document.getElementById('streamNotesPanel').style.display = 'block';
                let streamNotes = Generate_streamSession();
                const content = document.getElementById('streamNotesContent');
                content.innerHTML = markdownToHtml(streamNotes);
                startStreamNotesScroll();
            }
            break;
            
        case 'tododone':
            {
                cloud('Yeah');
                playSound('yeah', SoundEnum.yeah);
            }
            break;
    }
}

// Poll for effects and session data every 2 seconds
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        setInterval(checkForEffects, 2000);
        setInterval(checkTodosVisibility, 2000);
        setInterval(loadSessionFromDb, 5000);
    });
}

async function loadSessionFromDb() {
    try {
        const response = await fetch('/loadfromfile');
        const data = await response.json();
        
        if (data.Todos) {
            _streamSession.Todos = data.Todos.map((o) => { 
                const newTodo = new Todo(); 
                for (const [key, value] of Object.entries(o)) 
                { 
                    newTodo[key] = value; 
                } return newTodo; 
            });
            RefreshTodosArea();
        }
        
        if (data.Reminders) {
            _streamSession.Reminders = data.Reminders.map((o) => { 
                const newReminder = new Reminder(); 
                for (const [key, value] of Object.entries(o)) 
                { 
                    newReminder[key] = value; 
                } return newReminder; 
            });
        }
        
        if (data.Notes) {
            _streamSession.Notes = data.Notes;
        }
    } catch (err) {
        // Silent fail
    }
}

async function checkTodosVisibility() {
    try {
        const response = await fetch('/gettodosvisibility');
        const result = await response.json();
        SetTodoVisibility(result.visible);
    } catch (err) {
        // Silent fail
    }
}