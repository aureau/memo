# What I plan on adding
    - When beingRecording -> initNotepad
    This is going to be used so you can take notes while you're recording, a notepad that automatically formats markdown text (research how this is possible) and you can close out of and open.
    - Settings revamp


notepad while recording
    in the @recording-bar state, going have an interactive notepad (interactive as in being able to type freely), open and close, and **saved** to the Notes tab in @meeting-view
    going to be using the same styling as meeting-view notes area
    notepad will span a certain size
    stronger blur affect in notepad state (only recording-bar and notepad will be visible in blur)

markdown feature notes
    using libaries (react-markdown w/ rehype-raw rehype sanitize (to support markdowns) and remark-gfm)
https://remarkjs.github.io/react-markdown/
https://github.com/remarkjs/react-markdown

using the libraries on 2 inputs

first i need to complete the @notepad-while-recording feature to continue